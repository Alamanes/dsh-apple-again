/**
 * dsh-disk-lens — the browser half.
 *
 * One tab in the right sidebar. It draws what the tools last left behind, and
 * it can do three things without the model: start a scan, run the suggestions
 * already in the snapshot, and reveal a file the scan found.
 */
window.__ModuleLoader__.load({
  id: 'dsh-disk-lens',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const TAB_ID = 'dsh-disk-lens'
    const KIND = 'disk-lens'
    const ROUTE = 'api/dsh-disk-lens'
    const STYLE_ID = 'dl-style'
    const POLL_BUSY_MS = 1200
    const POLL_READ_MS = 8000
    const DELTA_FLOOR = 100 * 1024 * 1024
    const DELTA_TTL_MS = 9000
    const ARM_MS = 4000
    const FILE_LIMIT = 6

    const STATUS_TEXT = { ok: '', missing: '不存在', denied: '无权限', timeout: '超时', failed: '失败', cancel: '已取消' }
    const SAFETY_TEXT = { safe: '安全', review: '先看一眼', careful: '需谨慎' }
    const METHOD_TEXT = { trash: '废纸篓', delete: '直接删除', command: '命令' }
    const SCALE_TICKS = [25, 50, 75]

    const FAMILY_COLOR = {
      content: 'var(--dl-content)',
      tools: 'var(--dl-tools)',
      caches: 'var(--dl-caches)',
      system: 'var(--dl-system)',
    }

    let styleJob = null
    function ensureStyle() {
      if (document.getElementById(STYLE_ID) !== null) return
      if (styleJob !== null) return
      styleJob = fetch('/' + ROUTE + '/style')
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) => {
          if (text === '' || document.getElementById(STYLE_ID) !== null) return
          const node = document.createElement('style')
          node.id = STYLE_ID
          node.textContent = text
          document.head.appendChild(node)
        })
        .catch(() => { styleJob = null })
    }

    async function postJson(path, body) {
      const response = await fetch('/' + ROUTE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || json.ok === false) throw new Error(json.error || response.statusText)
      return json
    }

    function rmBytes(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1e12) return (value / 1e12).toFixed(2) + ' T'
      if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e11 ? 0 : 1) + ' G'
      return Math.max(0, value / 1e6).toFixed(0) + ' M'
    }

    function shortDate(iso) {
      if (!iso) return ''
      const date = new Date(String(iso))
      if (Number.isNaN(date.getTime())) return String(iso).slice(0, 16)
      return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    }

    /** ~/Library/Application Support rather than a 60-character absolute path. */
    function shortPath(path) {
      const text = String(path).replace(/^\/Users\/[^/]+/, '~')
      const parts = text.split('/').filter(Boolean)
      if (parts.length <= 3) return text
      return '…/' + parts.slice(-2).join('/')
    }

    function candidatesOf(snapshot) {
      if (snapshot === null) return []
      const out = []
      for (const category of snapshot.categories || []) {
        for (const candidate of category.cleanup || []) {
          if (candidate.ignored === true) continue
          out.push({ ...candidate, categoryId: category.id, category: category.name, family: category.family })
        }
      }
      return out
    }

    /** id -> byte difference since the previous snapshot, only where it matters. */
    function diffSnapshots(previous, next) {
      const out = {}
      if (!previous || !next || previous.createdAt === next.createdAt) return out
      const before = new Map((previous.categories || []).map((category) => [category.id, category.bytes]))
      for (const category of next.categories || []) {
        const old = before.get(category.id)
        if (old === undefined) continue
        const delta = category.bytes - old
        if (Math.abs(delta) >= DELTA_FLOOR) out[category.id] = delta
      }
      return out
    }

    class Reader {
      constructor() { this.base = ROUTE }
      async state() {
        const response = await fetch('/' + this.base + '/state', { headers: { accept: 'application/json' } })
        const json = await response.json().catch(() => ({}))
        if (!response.ok || json.ok === false) throw new Error(json.error || response.statusText)
        return json
      }
    }

    /** A figure that lifts into place when its value changes. */
    function Num({ value }) {
      const previous = useRef(value)
      const [bump, setBump] = useState(0)
      useEffect(() => {
        if (previous.current !== value) {
          previous.current = value
          setBump((count) => count + 1)
        }
      }, [value])
      return h('b', {
        key: bump,
        className: 'dl-num' + (bump > 0 ? ' is-bump' : ''),
      }, rmBytes(value))
    }

    function CopyButton({ text }) {
      const [done, setDone] = useState(false)
      const timer = useRef(null)
      useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
      return h('button', {
        type: 'button',
        className: 'dl-copy' + (done ? ' is-done' : ''),
        onClick: () => {
          const mark = () => {
            setDone(true)
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = setTimeout(() => setDone(false), 1200)
          }
          try {
            const result = navigator.clipboard?.writeText(text)
            if (result && typeof result.then === 'function') result.then(mark).catch(() => {})
            else mark()
          } catch { /* clipboard blocked */ }
        },
      }, done ? '已复制' : '复制')
    }

    /* ---------- gauge ---------- */

    function Gauge({ snapshot, changed, hot, onHot }) {
      const disk = (snapshot && snapshot.disk) || {}
      const total = Number(disk.total) || 0
      const available = Number(disk.available ?? disk.free) || 0
      const used = Number(disk.used) || Math.max(0, total - available)
      const reclaimable = Math.max(0, Number(disk.reclaimable) || 0)
      const hasData = snapshot !== null && total > 0

      const categories = snapshot
        ? snapshot.categories.slice().filter((category) => category.bytes > 0).sort((a, b) => b.bytes - a.bytes)
        : []
      const accounted = categories.reduce((sum, category) => sum + category.bytes, 0)
      const rest = Math.max(0, used - accounted)

      const segments = categories.map((category) => ({
        key: 'seg-' + category.id,
        id: category.id,
        name: category.name,
        bytes: category.bytes,
        color: FAMILY_COLOR[category.family] || FAMILY_COLOR.system,
        faded: category.id === 'unaccounted',
        percent: total > 0 ? (category.bytes / total) * 100 : 0,
      }))
      if (rest > 0) {
        segments.push({
          key: 'seg-rest',
          id: 'rest',
          name: '其他',
          bytes: rest,
          color: FAMILY_COLOR.system,
          faded: true,
          percent: total > 0 ? (rest / total) * 100 : 0,
        })
      }
      const freePercent = total > 0 ? (available / total) * 100 : 100
      const shown = segments.slice(0, 3)

      const figures = h('div', { className: 'dl-figures' },
        h('span', { className: 'dl-figure is-lead' },
          h('i', null, '已用'),
          hasData ? h(Num, { value: used }) : h('b', null, '—')
        ),
        hasData
          ? h('span', { className: 'dl-figure-sub' },
              '可用 ' + rmBytes(available)
              + (reclaimable > 0 ? ' · 可回收 ' + rmBytes(reclaimable) : '')
              + ' · 总计 ' + rmBytes(total))
          : null
      )

      if (!hasData) {
        return h('div', { className: 'dl-board-block dl-gauge' }, figures,
          h('div', { className: 'dl-empty' }, snapshot === null ? '还没有扫描结果' : '这次没有量到可用数据'))
      }

      const bar = h('div', { className: 'dl-bar' },
        segments.map((segment) => h('div', {
          key: segment.key,
          className: 'dl-seg'
            + (segment.faded ? ' is-faded' : '')
            + (hot === segment.id ? ' is-hot' : '')
            + (changed && changed[segment.id] !== undefined ? ' is-changed' : ''),
          style: { flexGrow: Math.max(segment.percent, 0.15), background: segment.color },
          title: segment.name + ' · ' + rmBytes(segment.bytes) + ' · ' + segment.percent.toFixed(1) + '%',
          onMouseEnter: () => onHot && onHot(segment.id),
          onMouseLeave: () => onHot && onHot(null),
        })),
        h('div', {
          key: 'seg-free',
          className: 'dl-seg is-free',
          style: { flexGrow: Math.max(freePercent, 0.15) },
          title: '可用 ' + rmBytes(available) + ' · ' + freePercent.toFixed(1) + '%',
        }),
        h('div', { key: 'scale', className: 'dl-bar-scale' },
          SCALE_TICKS.map((tick) => h('span', { key: tick, style: { left: tick + '%' } })))
      )

      const axis = h('div', { className: 'dl-scale-axis' })

      const legend = h('div', { className: 'dl-legend' },
        shown.map((segment) => h('span', {
          key: 'lg-' + segment.key,
          className: 'dl-legend-item' + (hot === segment.id ? ' is-hot' : ''),
          onMouseEnter: () => onHot && onHot(segment.id),
          onMouseLeave: () => onHot && onHot(null),
        },
          h('i', { className: 'dl-legend-dot' + (segment.faded ? ' is-faded' : ''), style: segment.faded ? undefined : { background: segment.color } }),
          h('span', { className: 'dl-legend-name' }, segment.name),
          h('b', null, rmBytes(segment.bytes))
        )),
        segments.length > shown.length
          ? h('span', { key: 'lg-more', className: 'dl-legend-item' },
              h('span', { className: 'dl-legend-name' }, '另 ' + (segments.length - shown.length) + ' 类'))
          : null,
        h('span', { key: 'lg-free', className: 'dl-legend-item' },
          h('i', { className: 'dl-legend-dot is-free' }),
          h('span', { className: 'dl-legend-name' }, '可用'),
          h('b', null, rmBytes(available))
        )
      )

      return h('div', { className: 'dl-board-block dl-gauge' }, figures, bar, axis, legend)
    }

    /* ---------- categories ---------- */

    function CategoryList({ snapshot, changed, onHot }) {
      const categories = snapshot ? snapshot.categories.slice().sort((a, b) => b.bytes - a.bytes) : []
      const deniedCount = snapshot ? Number(snapshot.deniedCount) || 0 : 0

      const head = h('div', { className: 'dl-block-head' },
        h('span', null, '分类'),
        h('span', null, categories.length + ' 项')
      )

      if (categories.length === 0) {
        return h('div', { className: 'dl-board-block' }, head,
          h('div', { className: 'dl-empty' }, '扫描后这里按占用大小列出每一类。'))
      }

      const rows = categories.map((category) => {
        const items = category.items || []
        const faded = category.id === 'unaccounted'
        const delta = changed ? changed[category.id] : undefined
        const tags = []
        if (category.readOnly) tags.push(h('span', { key: 'readonly', className: 'dl-tag' }, '只读'))
        if (faded && deniedCount > 0) tags.push(h('span', { key: 'denied', className: 'dl-tag' }, deniedCount + ' 个目录被拒'))
        if ((category.cleanup || []).some((item) => item.origin === 'model')) {
          tags.push(h('span', { key: 'model', className: 'dl-tag is-model' }, '模型'))
        }
        return h('div', {
          key: category.id,
          className: 'dl-row'
            + (faded ? ' is-faded' : '')
            + (delta !== undefined ? ' is-changed' : ''),
          'data-family': category.family,
          onMouseEnter: () => onHot && onHot(category.id),
          onMouseLeave: () => onHot && onHot(null),
        },
          h('div', { className: 'dl-row-main' },
            h('span', { className: 'dl-row-name' }, category.name, tags),
            h('span', { className: 'dl-row-size' },
              rmBytes(category.bytes),
              delta !== undefined
                ? h('i', { className: 'dl-delta' + (delta < 0 ? ' is-down' : '') },
                    (delta > 0 ? '+' : '−') + rmBytes(Math.abs(delta)))
                : null)
          ),
          items.length > 0
            ? h('div', { className: 'dl-subs' }, items.slice(0, 2).map((item, index) =>
                h('div', {
                  key: category.id + '-item-' + index,
                  className: 'dl-sub' + (item.status !== 'ok' ? ' is-denied' : ''),
                },
                  h('span', null, item.label + (STATUS_TEXT[item.status] ? '（' + STATUS_TEXT[item.status] + '）' : '')),
                  h('b', null, rmBytes(item.bytes))
                )))
            : null,
          items.length > 2 ? h('div', { className: 'dl-more' }, '另有 ' + (items.length - 2) + ' 项') : null
        )
      })

      return h('div', { className: 'dl-board-block' }, head, rows)
    }

    /* ---------- suggestions ---------- */

    function SuggestionList({ snapshot, onHot, onClean, onCleanAll, armed, busy }) {
      const candidates = candidatesOf(snapshot)
      const totalBytes = candidates.reduce((sum, candidate) => sum + (candidate.bytes || 0), 0)
      const safe = candidates.filter((candidate) => candidate.safety === 'safe')
      const safeBytes = safe.reduce((sum, candidate) => sum + (candidate.bytes || 0), 0)

      const head = h('div', { className: 'dl-block-head' },
        h('span', null, '清理建议'),
        safe.length > 0
          ? h('button', {
              type: 'button',
              className: 'dl-act is-quiet',
              disabled: busy !== '' || armed !== '',
              onClick: () => onCleanAll(safe),
            }, '清理安全项 ' + safe.length + ' · ' + rmBytes(safeBytes))
          : h('span', null, candidates.length === 0 ? '—' : candidates.length + ' 条 · ' + rmBytes(totalBytes))
      )

      if (candidates.length === 0) {
        return h('div', { className: 'dl-board-block' }, head,
          h('div', { className: 'dl-empty' }, '规则会给出缓存类建议；让模型分析一次，它还会补上自己找到的。'))
      }

      const rows = candidates.map((candidate) => {
        const command = candidate.command || (candidate.paths || []).join('\n')
        const isBusy = busy === candidate.id
        const isArmed = armed === candidate.id
        return h('div', {
          key: candidate.id,
          className: 'dl-row',
          'data-family': candidate.family,
          onMouseEnter: () => onHot && onHot(candidate.categoryId),
          onMouseLeave: () => onHot && onHot(null),
        },
          h('div', { className: 'dl-row-main' },
            h('span', { className: 'dl-row-name' }, candidate.label),
            h('span', { className: 'dl-row-size' }, rmBytes(candidate.bytes)),
            h('button', {
              type: 'button',
              className: 'dl-act'
                + (isArmed ? ' is-armed' : '')
                + (candidate.safety === 'safe' ? ' is-safe' : ''),
              disabled: busy !== '' && !isBusy,
              onClick: () => onClean(candidate),
            }, isBusy ? '清理中' : isArmed ? '确认？' : candidate.safety === 'safe' ? '清理' : '清理')
          ),
          h('div', { className: 'dl-tags' },
            h('span', { key: 'safety', className: 'dl-tag is-' + candidate.safety }, SAFETY_TEXT[candidate.safety] || '需谨慎'),
            h('span', { key: 'method', className: 'dl-tag' }, METHOD_TEXT[candidate.method] || '命令'),
            candidate.origin === 'model' ? h('span', { key: 'origin', className: 'dl-tag is-model' }, '模型') : null
          ),
          candidate.why ? h('p', { className: 'dl-sug-why' }, candidate.why) : null,
          command
            ? h('div', { className: 'dl-cmd-wrap' },
                h(CopyButton, { text: command }),
                h('pre', { className: 'dl-cmd' }, command))
            : null
        )
      })

      return h('div', { className: 'dl-board-block' }, head, rows)
    }

    /* ---------- biggest files ---------- */

    function FileList({ snapshot, onReveal, busy }) {
      const files = snapshot && snapshot.index && Array.isArray(snapshot.index.bigFiles)
        ? snapshot.index.bigFiles.slice(0, FILE_LIMIT)
        : []
      if (files.length === 0) return null
      return h('div', { className: 'dl-board-block' },
        h('div', { className: 'dl-block-head' },
          h('span', null, '最大的文件'),
          h('span', null, files.length + ' 个')),
        files.map((file) => h('button', {
          key: file.path,
          type: 'button',
          className: 'dl-file',
          title: file.path + '（点击在访达中显示）',
          disabled: busy !== '',
          onClick: () => onReveal(file.path),
        },
          h('b', null, rmBytes(file.bytes)),
          h('span', null, shortPath(file.path))
        ))
      )
    }

    /* ---------- the pane ---------- */

    function DiskLensPane({ api }) {
      const client = useMemo(() => api || new Reader(), [api])
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [changed, setChanged] = useState({})
      const [hot, setHot] = useState(null)
      const [armed, setArmed] = useState('')
      const [busy, setBusy] = useState('')
      const mounted = useRef(true)
      const seq = useRef(0)
      const lastSnapshot = useRef(null)
      const changedTimer = useRef(null)
      const armTimer = useRef(null)

      useEffect(() => {
        mounted.current = true
        ensureStyle()
        return () => {
          mounted.current = false
          if (changedTimer.current !== null) clearTimeout(changedTimer.current)
          if (armTimer.current !== null) clearTimeout(armTimer.current)
        }
      }, [])

      const refresh = useCallback(async () => {
        const token = ++seq.current
        try {
          const next = await client.state()
          if (!mounted.current || token !== seq.current) return
          setState(next)
          const snapshot = next.snapshot
          if (snapshot) {
            const diff = diffSnapshots(lastSnapshot.current, snapshot)
            lastSnapshot.current = snapshot
            if (Object.keys(diff).length > 0) {
              setChanged(diff)
              if (changedTimer.current !== null) clearTimeout(changedTimer.current)
              changedTimer.current = setTimeout(() => setChanged({}), DELTA_TTL_MS)
            }
          }
          if (next.error && !next.scanning) setError(String(next.error).slice(0, 200))
          else setError('')
        } catch (problem) {
          if (mounted.current && token === seq.current) setError(problem instanceof Error ? problem.message : String(problem))
        }
      }, [client])

      const act = useCallback(async (path, body, key) => {
        setBusy(key)
        setError('')
        try {
          await postJson(path, body)
          await refresh()
        } catch (problem) {
          if (mounted.current) setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          if (mounted.current) setBusy('')
        }
      }, [refresh])

      const disarm = useCallback(() => {
        if (armTimer.current !== null) clearTimeout(armTimer.current)
        setArmed('')
      }, [])

      const clean = useCallback((candidate) => {
        if (candidate.safety !== 'safe' && armed !== candidate.id) {
          setArmed(candidate.id)
          if (armTimer.current !== null) clearTimeout(armTimer.current)
          armTimer.current = setTimeout(() => { if (mounted.current) setArmed('') }, ARM_MS)
          return
        }
        disarm()
        void act('/clean', { ids: [candidate.id] }, candidate.id)
      }, [armed, act, disarm])

      const cleanAll = useCallback((list) => {
        disarm()
        void act('/clean', { ids: list.map((item) => item.id) }, 'batch')
      }, [act, disarm])

      const reveal = useCallback((path) => {
        void act('/reveal', { path }, 'reveal')
      }, [act])

      const scanning = state !== null && state.scanning === true

      useEffect(() => {
        if (typeof EventSource !== 'function') return undefined
        const source = new EventSource('/' + ROUTE + '/events')
        source.onmessage = () => { void refresh() }
        return () => { source.close() }
      }, [refresh])

      useEffect(() => {
        void refresh()
        const timer = setInterval(() => { if (!document.hidden) void refresh() }, scanning ? POLL_BUSY_MS : POLL_READ_MS)
        return () => clearInterval(timer)
      }, [refresh, scanning])

      useEffect(() => {
        const onVisibility = () => { if (!document.hidden) void refresh() }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
      }, [refresh])

      const snapshot = state ? state.snapshot : null
      const progress = state ? state.progress : null
      const progressPercent = scanning && progress && progress.total > 0 ? Math.round(100 * (progress.done / progress.total)) : 0

      const status = scanning
        ? h('span', { className: 'dl-live' },
            h('i', { className: 'dl-live-dot' }),
            h('span', null, progress && progress.total > 0 ? progress.done + '/' + progress.total : '测量中')
          )
        : h('span', { className: 'dl-head-time' }, snapshot ? shortDate(snapshot.createdAt) : '未扫描')

      return h('div', { className: 'dl-root is-pane', 'data-dsh-plugin': 'disk-lens' },
        h('header', { className: 'dl-head' },
          h('div', { className: 'dl-head-title' }, h(DiskLensIcon, { size: 14 }), h('span', null, '盘面')),
          h('div', { className: 'dl-head-right' },
            status,
            h('button', {
              type: 'button',
              className: 'dl-act is-scan' + (scanning ? ' is-busy' : ''),
              disabled: scanning || busy === 'scan',
              onClick: () => { void act('/scan', {}, 'scan') },
            }, scanning ? '扫描中' : '扫描')
          )
        ),

        scanning
          ? h('div', { className: 'dl-progress' },
              h('div', { className: 'dl-progress-fill', style: { width: progressPercent + '%' } }),
              h('span', null, (progress && progress.path) || '准备中…')
            )
          : null,

        error !== '' ? h('div', { className: 'dl-error' }, error) : null,

        h('section', { className: 'dl-board' },
          h(Gauge, { snapshot, changed, hot, onHot: setHot }),
          h(CategoryList, { snapshot, changed, onHot: setHot }),
          h(SuggestionList, {
            snapshot,
            onHot: setHot,
            onClean: clean,
            onCleanAll: cleanAll,
            armed,
            busy,
          }),
          h(FileList, { snapshot, onReveal: reveal, busy })
        ),

        snapshot && snapshot.headline ? h('p', { className: 'dl-headline' }, snapshot.headline) : null,
        snapshot && snapshot.summary ? h('p', { className: 'dl-summary' }, snapshot.summary) : null
      )
    }

    function PaneTitle() {
      return h('span', { className: 'dl-pane-chip' }, h(DiskLensIcon, { size: 12 }), h('span', null, '盘面'))
    }

    function DiskLensIcon({ size }) {
      const px = size || 15
      return h('svg', { width: px, height: px, viewBox: '0 0 18 18', 'aria-hidden': 'true' },
        h('path', { d: 'M2 13.5 2 15h14v-1.5H2Z', fill: 'currentColor', opacity: 0.45 }),
        h('path', { d: 'M2.5 10.2c2.6-2.6 4.2.6 6.6-1.4 2-1.7 3.4-1 6.4.9v3.3h-13v-2.8Z', fill: 'currentColor', opacity: 0.75 }),
        h('path', { d: 'M4.5 6.6c1.9-2 3.4-.4 5.2-1.9 1.3-1.1 2.6-.3 4.1.9V9c-2.6-1.8-4-2.4-5.8-.8-2 1.8-3.4-.8-5.4 1.1V6.4l1.9.2Z', fill: 'currentColor' })
      )
    }

    function definition() {
      return {
        id: TAB_ID,
        kind: KIND,
        priority: 'builtin',
        title: () => '盘面',
        guide: [{
          id: 'disk-lens',
          order: 42,
          title: () => '盘面',
          description: () => '磁盘占用与清理建议',
          icon: DiskLensIcon,
        }],
      }
    }

    function install(ctx) {
      ctx.inject(['slots', 'sidebarRightTabs'], (scope) => {
        try {
          scope.effect(() => scope.sidebarRightTabs.register(definition()), 'dsh-disk-lens: tab type')
        } catch (problem) {
          console.warn('dsh-disk-lens: tab type not registered', problem)
        }
        scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          inject: () => ({ api: new Reader() }),
        }, DiskLensPane)), 'dsh-disk-lens: tab body')
        scope.effect(() => scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
        }, PaneTitle)), 'dsh-disk-lens: tab title')
      }, 'dsh-disk-lens: right pane')
    }

    const moduleValue = { exports: {} }
    moduleValue.exports.apply = install
    moduleValue.exports.inject = ['slots', 'sidebarRightTabs']
    return moduleValue.exports
  },
})
