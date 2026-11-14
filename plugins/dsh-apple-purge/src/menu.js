/**
 * dsh-apple-purge: optional account-menu entry.
 *
 * Not injected by default. The panel ships as a sidebar row plus a main-slot
 * page, which keeps the shell intact; this script exists for builds that want
 * the account menu to carry the entry as well. Enabling it means calling
 * injectMenuScript() from src/index.js on the webserver/index-inject hook.
 */
export const MENU_SCRIPT = `(() => {
  const FLAG = '__dshApplePurgeMenu'
  if (globalThis[FLAG] === true) return
  globalThis[FLAG] = true

  const SELECTOR = '[data-apple-purge-entry]'
  const LABEL = '限制'
  const ROW = /^(剩余用量|插件|自动化任务|技能|记忆|重启|设置|Usage|Plugins|Automations|Skills|Memory|Restart|Settings)$/
  const MEMORY = /^(记忆|Memory)$/

  function accountMenu() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      const items = menu.querySelectorAll('[role="menuitem"]')
      let hits = 0
      for (const item of items) {
        if (ROW.test((item.textContent || '').trim())) hits += 1
      }
      if (hits >= 2) return menu
    }
    return null
  }

  function open(event) {
    event.preventDefault()
    event.stopPropagation()
    const win = window.open('/dsh-apple-purge/ui', '_blank', 'noopener')
    if (win === null) window.location.href = '/dsh-apple-purge/ui'
  }

  function insert(menu) {
    if (menu.querySelector(SELECTOR)) return
    const rows = Array.from(menu.querySelectorAll('[role="menuitem"]'))
    if (!rows.length) return
    const template = rows.find((row) => MEMORY.test((row.textContent || '').trim())) || rows[0]
    const row = template.cloneNode(true)
    row.setAttribute('data-apple-purge-entry', '')
    row.removeAttribute('id')
    row.style.cursor = 'pointer'

    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.nodeValue || '').trim() === '') continue
      node.nodeValue = LABEL
      break
    }

    const glyph = row.querySelector('svg')
    if (glyph !== null) {
      const icon = document.createElement('img')
      icon.src = '/dsh-apple-purge/icon-upstream.png'
      icon.alt = ''
      icon.width = 16
      icon.height = 16
      icon.style.borderRadius = '3px'
      icon.style.objectFit = 'cover'
      glyph.replaceWith(icon)
    }

    row.addEventListener('click', open)
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event)
    })

    const anchor = rows.find((item) => MEMORY.test((item.textContent || '').trim()))
    if (anchor !== undefined) anchor.after(row)
    else rows[rows.length - 1].before(row)
  }

  const observer = new MutationObserver(() => {
    const menu = accountMenu()
    if (menu !== null) insert(menu)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const first = accountMenu()
  if (first !== null) insert(first)
})()`;

export const MENU_STYLE = `[data-apple-purge-entry] { letter-spacing: 0.01em; }
[data-apple-purge-entry] img { flex: none; }`;
