/**
 * Restart control: one row inside the account menu at the sidebar foot, above
 * Settings, that fully quits and relaunches the DSH desktop app.
 *
 * Why the account menu rather than a corner seat: the frame's top-right corner
 * is shared with the right rail's control group. A seat there has to re-measure
 * that group on every layout change and still lands on top of it while the rail
 * slides, so the control is parked in the one surface whose rows the host lays
 * out itself.
 *
 * Why injection: the menu's rows come from a fixed list inside the host's
 * account surface and no slot is declared for them, so the row is cloned from
 * the Settings row of the open menu instead of registered into it. The menu is
 * rebuilt on every open, which makes one injection per open the whole
 * lifecycle: no teardown, no stale node.
 *
 * The row owns no restart logic. It posts the current session id to the host
 * half and waits: roughly a second later the whole app goes away, so the only
 * durable state is the host's pending-session file.
 */
function dshuiComponent_restart(rt) {
  /** Locale namespace for this component's copy. */
  const NS = 'dsh-restart'

  /**
   * Host route that schedules the quit-and-relaunch.
   *
   * The suite namespaces its host routes, so the old standalone spelling stays
   * registered on the host half as an alias: a page cached from before the
   * migration keeps working until it is reloaded.
   */
  const RESTART_ROUTE = '/dsh-ui-copy/restart'

  /** Copy, in the shape `ctx.locale.register` takes. */
  const zh = {
    'menu.label': '重启',
    'menu.pending': '正在关闭并重新启动…',
    'failed.network': '请求发不出去，重启未开始。',
    'failed.desktop': '当前不是桌面应用宿主，无法重启。',
    'failed.generic': '重启失败，请重试。',
  }
  const en = {
    'menu.label': 'Restart',
    'menu.pending': 'Quitting and relaunching…',
    'failed.network': 'The request could not be sent; nothing was restarted.',
    'failed.desktop': 'This process is not the desktop app host, so it cannot restart.',
    'failed.generic': 'Restart failed. Try again.',
  }

  /**
   * Stylesheet for the injected row. Everything that can come from the cloned
   * host row does; only the three spans and the busy state are owned here.
   */
  const STYLESHEET = `
.dsh-restart-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.dsh-restart-row-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 16px; color: inherit; }
.dsh-restart-row-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: inherit; font-size: inherit; font-weight: inherit; }
.dsh-restart-row[aria-disabled="true"] { opacity: .6; }
.dsh-restart-row-spin { animation: dsh-restart-spin .9s linear infinite; }
@keyframes dsh-restart-spin { to { transform: rotate(360deg); } }
`

  /** What the row should read right now: idle, busy, or holding an error. */
  const state = { phase: 'idle', error: null }

  /**
   * Row labels. A row may be a real `menuitem`, a plain button or a link: the
   * menu surfaces differ between the web app and the desktop shell, so the text
   * is what identifies a row, not its role.
   */
  const SIGN_OUT = /^(退出登录|Sign out)/
  const SETTINGS_ROW = /^(设置|Settings)/

  /** Trim whitespace runs so a row's text reads as one line. */
  function rowText(row) {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  /** The open account menu: one holding a sign-out row, else a settings row. */
  function findAccountMenu() {
    const menus = document.querySelectorAll('[role="menu"]')
    for (const menu of menus) {
      for (const row of menu.querySelectorAll('[role="menuitem"], button, a')) {
        if (SIGN_OUT.test(rowText(row))) return menu
      }
    }
    for (const menu of menus) {
      for (const row of menu.querySelectorAll('[role="menuitem"], button, a')) {
        if (SETTINGS_ROW.test(rowText(row))) return menu
      }
    }
    return null
  }

  /**
   * The row this one sits above: Settings where the build puts it in the menu,
   * otherwise the menu's first row so the entry still lands inside the menu.
   */
  function findAnchorRow(menu) {
    for (const row of menu.querySelectorAll('[role="menuitem"]')) {
      if (SETTINGS_ROW.test(rowText(row))) return row
    }
    for (const row of menu.querySelectorAll('button, a')) {
      if (SETTINGS_ROW.test(rowText(row))) return row
    }
    return menu.querySelector('[role="menuitem"], button, a')
  }

  /** A circular-arrow glyph as a DOM node, for the row built outside React. */
  function glyphNode() {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '15')
    svg.setAttribute('height', '15')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.3')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('aria-hidden', 'true')

    const arc = document.createElementNS(ns, 'path')
    arc.setAttribute('d', 'M13.1 8a5.1 5.1 0 1 1-1.5-3.6')
    const head = document.createElementNS(ns, 'path')
    head.setAttribute('d', 'M13.3 2.9v3h-3')
    svg.append(arc, head)
    return svg
  }

  /**
   * One menu row, cloned from the anchor so it inherits the host's spacing,
   * hover and focus treatment.
   *
   * @param template - the row to clone.
   * @returns the empty row, still without copy or handler.
   */
  function buildRow(template) {
    const row = template.cloneNode(false)
    row.setAttribute('data-dsh-restart-row', '')
    row.setAttribute('role', 'menuitem')
    row.setAttribute('tabindex', '-1')
    row.classList.add('dsh-restart-row')
    while (row.firstChild !== null) row.removeChild(row.firstChild)

    const icon = document.createElement('span')
    icon.className = 'dsh-restart-row-icon'
    icon.appendChild(glyphNode())

    const label = document.createElement('span')
    label.className = 'dsh-restart-row-label'

    row.append(icon, label)
    return row
  }

  /**
   * Write the current state onto a row. Every write is guarded by a comparison:
   * the menu is rebuilt inside the same mutation sweep that watches it, so an
   * unconditional write would feed the observer its own output.
   *
   * @param row - the injected row.
   * @param t - bound translation.
   */
  function paint(row, t) {
    const label = row.querySelector('.dsh-restart-row-label')
    if (label === null) return
    const glyph = row.querySelector('.dsh-restart-row-icon svg')

    const busy = state.phase === 'busy'
    if (busy) {
      if (label.textContent !== t('menu.pending')) label.textContent = t('menu.pending')
      if (row.getAttribute('aria-disabled') !== 'true') row.setAttribute('aria-disabled', 'true')
      if (glyph !== null) glyph.classList.add('dsh-restart-row-spin')
      return
    }

    const next = state.error === null ? t('menu.label') : state.error
    if (label.textContent !== next) label.textContent = next
    if (row.hasAttribute('aria-disabled')) row.removeAttribute('aria-disabled')
    if (glyph !== null) glyph.classList.remove('dsh-restart-row-spin')
    if (state.error === null) {
      if (row.hasAttribute('title')) row.removeAttribute('title')
    } else {
      row.setAttribute('title', state.error)
    }
  }

  /**
   * Keep exactly one restart row in the open menu.
   *
   * @param t - bound translation.
   * @param press - the click handler.
   */
  function ensureRow(t, press) {
    const menu = findAccountMenu()
    if (menu === null) return

    const existing = menu.querySelector('[data-dsh-restart-row]')
    if (existing !== null) {
      paint(existing, t)
      return
    }

    const anchor = findAnchorRow(menu)
    if (anchor === null) return
    const wrap = anchor.parentNode
    if (wrap === null) return

    const row = buildRow(anchor)
    row.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      press()
    })
    paint(row, t)
    wrap.insertBefore(row, anchor)
  }

  /**
   * Install the row.
   *
   * The locale and session services are waited for here rather than declared on
   * the plugin, so a composition without them leaves this component inert and
   * the rest of the suite running.
   *
   * @param scope - client context with `locale` and `uiSession`.
   */
  function install(scope) {
    rt.style('restart', STYLESHEET)

    scope.effect(() => scope.locale.register(NS, { zh, en }), 'ui-copy/restart: dictionaries')

    const bind = scope.locale.bind(NS)

    /** The session currently occupying the main view, if any. */
    const currentSessionId = () => {
      try {
        return scope.uiSession?.current?.getSnapshot?.()?.key
      } catch {
        return undefined
      }
    }

    /**
     * Ask the host to quit and relaunch the app.
     *
     * @returns resolution once the host accepted the request.
     * @throws when the request could not be sent or the host refused it.
     */
    const restart = async () => {
      let response
      try {
        response = await fetch(RESTART_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: currentSessionId() }),
          credentials: 'same-origin',
        })
      } catch {
        throw new Error(bind('failed.network'))
      }

      let payload = null
      try {
        payload = await response.json()
      } catch {
        // A body-less failure keeps its status-only verdict below.
      }

      if (!response.ok || payload === null || payload.ok !== true) {
        throw new Error(payload !== null && payload.reason === 'not-desktop' ? bind('failed.desktop') : bind('failed.generic'))
      }
      return payload
    }

    /** Start the restart; the row reads its own busy and error state. */
    const press = () => {
      if (state.phase === 'busy') return
      state.phase = 'busy'
      state.error = null
      restart().catch((reason) => {
        state.phase = 'idle'
        state.error = reason instanceof Error ? reason.message : String(reason)
      })
    }

    rt.observe(() => {
      // The runtime drops a pass that throws, so one bad frame must not cost the
      // menu row for the rest of the page's life.
      try {
        ensureRow(bind, press)
      } catch (error) {
        rt.warn('restart menu row failed: ' + String((error && error.message) || error))
      }
    })
  }

  rt.ctx.inject(['locale', 'uiSession'], (scope) => install(scope))
}
