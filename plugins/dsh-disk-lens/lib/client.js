/**
 * dsh-disk-lens browser half.
 *
 * One page in the center column and one row in the sidebar list. The page does
 * the talking: a sand map of the last snapshot, the categories behind it, the
 * cleanup suggestions the rules and the model produced, the exact script a
 * clean will run, and the audit log of what already ran.
 */
window.__ModuleLoader__.load({
  id: 'dsh-disk-lens',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const PANEL_ID = 'disk-lens'
    const ROUTE = 'api/dsh-disk-lens'
    const POLL_BUSY_MS = 900
    const POLL_IDLE_MS = 5000

    const FAMILY_COLOR = {
      content: 'var(--dl-content)',
      tools: 'var(--dl-tools)',
      caches: 'var(--dl-caches)',
      system: 'var(--dl-system)',
    }

    let styleJob = null
    function ensureStyle() {
      if (document.getElementById('dl-style') !== null) return
      if (styleJob !== null) return
      styleJob = fetch('/' + ROUTE + '/style')
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) => {
          if (text === '' || document.getElementById('dl-style') !== null) return
          const node = document.createElement('style')
          node.id = 'dl-style'
          node.textContent = text
          document.head.appendChild(node)
        })
        .catch(() => {})
    }

    function rmBytes(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1e12) return (value / 1e12).toFixed(2) + ' T'
      if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e11 ? 0 : 1) + ' G'
      return Math.max(0, value / 1e6).toFixed(0) + ' M'
    }

    function shortDate(iso) {
      if (!iso) return ''
      const text = String(iso)
      return text.slice(0, 10) + ' ' + text.slice(11, 16)
    }

    function candidatesOf(snapshot) {
      if (!snapshot) return []
      const out = []
      for (const category of snapshot.categories || []) {
        for (const candidate of category.cleanup || []) out.push({ ...candidate, category: category.name, family: category.family })
      }
      return out
    }

    class Api {
      constructor() { this.base = ROUTE }
      async get(path) {
        const response = await fetch('/' + this.base + path, { headers: { accept: 'application/json' } })
        const json = await response.json().catch(() => ({}))
        if (!response.ok || json.ok === false) throw new Error(json.error || response.statusText)
        return json
      }
      async post(path, body) {
        const response = await fetch('/' + this.base + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok || json.ok === false) throw new Error(json.error || response.statusText)
        return json
      }
      state() { return this.get('/state') }
      scan(rules) { return this.post('/scan', { rules }) }
      cancel() { return this.post('/cancel', {}) }
      plan(ids) { return this.post('/plan', { ids }) }
      clean(ids) { return this.post('/clean', { ids }) }
      settings(patch) { return this.post('/settings', patch) }
    }

    /* ---------- capacity bar ---------- */

    function CapacityBar({ snapshot, scanning, progress, active, onSelect }) {
      const total = snapshot ? snapshot.disk.total : 0
      const free = snapshot ? snapshot.disk.free : 0
      const used = snapshot ? snapshot.disk.used : 0
      const freePct = total > 0 ? (free / total) * 100 : 100
      const categories = snapshot
        ? snapshot.categories.slice().filter((category) => category.bytes > 0).sort((a, b) => b.bytes - a.bytes)
        : []
      const accounted = categories.reduce((sum, category) => sum + category.bytes, 0)
      const rest = snapshot ? Math.max(0, used - accounted) : 0
      const segments = categories.map((category) => ({
        id: category.id,
        name: category.name,
        family: category.family,
        bytes: category.bytes,
        percent: total > 0 ? (category.bytes / total) * 100 : 0,
      }))
      if (rest > 0) segments.push({ id: '__rest', name: '其他已用', family: 'system', bytes: rest, percent: total > 0 ? (rest / total) * 100 : 0 })
      const hasData = snapshot !== null && total > 0

      return h('section', { className: 'dl-map' },
        h('div', { className: 'dl-map-head' },
          h('div', { className: 'dl-map-chips' },
            h('span', { className: 'dl-chip' }, snapshot ? '扫描于 ' + shortDate(snapshot.createdAt) : '还没有扫描'),
            snapshot ? h('span', { className: 'dl-chip' }, '已用 ' + rmBytes(used) + ' / ' + rmBytes(total)) : null
          ),
          scanning && progress && progress.total > 0
            ? h('span', { className: 'dl-chip' }, '正在测量 ' + progress.done + ' / ' + progress.total)
            : null
        ),
        hasData
          ? h('div', { className: 'dl-bar' + (scanning ? ' is-scanning' : '') },
              segments.map((segment) => h('button', {
                key: segment.id,
                type: 'button',
                className: 'dl-seg' + (active === segment.id ? ' is-active' : ''),
                style: { flexGrow: Math.max(segment.percent, 0.15), background: FAMILY_COLOR[segment.family] || 'var(--dl-system)' },
                title: segment.name + ' · ' + rmBytes(segment.bytes) + ' · ' + segment.percent.toFixed(1) + '%',
                onClick: () => onSelect(active === segment.id ? '' : segment.id),
              })),
              h('div', { className: 'dl-seg is-free', style: { flexGrow: Math.max(freePct, 0.15) }, title: '可用 ' + rmBytes(free) + ' · ' + freePct.toFixed(1) + '%' })
            )
          : h('div', { className: 'dl-bar-empty' }, scanning ? '正在测量…' : '点「开始扫描」，用规则表量一遍磁盘。'),
        hasData
          ? h('div', { className: 'dl-legend' },
              segments.map((segment) => h('button', {
                key: 'legend-' + segment.id,
                type: 'button',
                className: 'dl-legend-row' + (active === segment.id ? ' is-active' : ''),
                onClick: () => onSelect(active === segment.id ? '' : segment.id),
              },
                h('i', { className: 'dl-legend-dot', style: { background: FAMILY_COLOR[segment.family] || 'var(--dl-system)' } }),
                h('span', { className: 'dl-legend-name' }, segment.name),
                h('span', { className: 'dl-legend-size' }, rmBytes(segment.bytes)),
                h('span', { className: 'dl-legend-pct' }, segment.percent >= 0.5 ? segment.percent.toFixed(0) + '%' : '<1%')
              )),
              h('div', { className: 'dl-legend-row is-free' },
                h('i', { className: 'dl-legend-dot' }),
                h('span', { className: 'dl-legend-name' }, '可用'),
                h('span', { className: 'dl-legend-size' }, rmBytes(free)),
                h('span', { className: 'dl-legend-pct' }, freePct.toFixed(0) + '%')
              )
            )
          : null
      )
    }

    /* ---------- categories ---------- */

    function CategoryList({ snapshot, active, onSelect }) {
      const categories = snapshot ? snapshot.categories.slice().sort((a, b) => b.bytes - a.bytes) : []
      return h('section', { className: 'dl-panel' },
        h('div', { className: 'dl-panel-head' },
          h('h3', null, '分类'),
          h('span', null, categories.length + ' 项')
        ),
        categories.length === 0
          ? h('div', { className: 'dl-empty' }, '扫描后这里按占用大小列出每一类。')
          : categories.map((category) => h('div', {
              key: category.id,
              className: 'dl-cat' + (active === category.id ? ' is-active' : ''),
              'data-family': category.family,
              onClick: () => onSelect(active === category.id ? '' : category.id),
            },
              h('span', { className: 'dl-cat-bar' }),
              h('div', null,
                h('div', { className: 'dl-cat-name' }, category.name,
                  category.readOnly ? h('span', { className: 'dl-tag' }, '只读') : null,
                  (category.cleanup || []).some((item) => item.origin === 'model') ? h('span', { className: 'dl-tag is-model' }, '模型') : null
                ),
                category.note ? h('div', { className: 'dl-cat-note' }, category.note) : null,
                active === category.id && category.items.length > 0
                  ? h('div', { className: 'dl-cat-items' }, category.items.slice(0, 10).map((item, index) =>
                      h('div', { key: category.id + '-item-' + index, className: 'dl-cat-item' + (item.status === 'denied' ? ' is-denied' : '') },
                        h('span', null, item.label + (item.status === 'denied' ? '（无法读取）' : item.status === 'timeout' ? '（测量超时）' : '')),
                        h('b', null, rmBytes(item.bytes))
                      )))
                  : null
              ),
              h('span', { className: 'dl-cat-size' }, rmBytes(category.bytes))
            ))
      )
    }

    /* ---------- suggestions ---------- */

    function SuggestionList({ snapshot, selected, onToggle }) {
      const candidates = candidatesOf(snapshot)
      return h('section', { className: 'dl-panel' },
        h('div', { className: 'dl-panel-head' },
          h('h3', null, '清理建议'),
          h('span', null, candidates.length + ' 条可勾选')
        ),
        candidates.length === 0
          ? h('div', { className: 'dl-empty' }, '还没有建议。规则扫描会给出缓存类建议，模型分析会补充它找到的。')
          : candidates.map((candidate) => {
              const on = selected.has(candidate.id)
              return h('div', { key: candidate.id, className: 'dl-sug' },
                h('button', {
                  type: 'button',
                  className: 'dl-check',
                  'data-on': on ? 'true' : 'false',
                  'aria-pressed': on,
                  'aria-label': (on ? '取消勾选 ' : '勾选 ') + candidate.label,
                  onClick: () => onToggle(candidate.id),
                }, on ? '✓' : ''),
                h('div', null,
                  h('div', { className: 'dl-sug-label' }, candidate.label,
                    h('span', { className: 'dl-tag is-' + candidate.safety }, candidate.safety === 'safe' ? '安全' : candidate.safety === 'review' ? '先看一眼' : '需谨慎'),
                    h('span', { className: 'dl-tag' }, candidate.method === 'trash' ? '废纸篓' : candidate.method === 'delete' ? '直接删除' : '命令'),
                    candidate.origin === 'model' ? h('span', { className: 'dl-tag is-model' }, '模型') : null
                  ),
                  candidate.why ? h('div', { className: 'dl-sug-why' }, candidate.why) : null,
                  candidate.method === 'command'
                    ? h('div', { className: 'dl-sug-cmd' }, candidate.command)
                    : h('div', { className: 'dl-sug-cmd' }, (candidate.paths || []).join('\n'))
                ),
                h('span', { className: 'dl-sug-size' }, rmBytes(candidate.bytes))
              )
            })
      )
    }

    /* ---------- page ---------- */

    function DiskLensPage({ api }) {
      const client = useMemo(() => api || new Api(), [api])
      const [state, setState] = useState(null)
      const [active, setActive] = useState('')
      const [selected, setSelected] = useState(() => new Set())
      const [plan, setPlan] = useState(null)
      const [running, setRunning] = useState(false)
      const [error, setError] = useState('')
      const [tab, setTab] = useState('audit')
      const mounted = useRef(true)

      useEffect(() => { ensureStyle(); return () => { mounted.current = false } }, [])

      const refresh = useCallback(async () => {
        try {
          const next = await client.state()
          if (!mounted.current) return
          setState(next)
          setError('')
        } catch (problem) {
          if (mounted.current) setError(problem instanceof Error ? problem.message : String(problem))
        }
      }, [client])

      useEffect(() => {
        void refresh()
        const busy = state !== null && state.scanning
        const timer = setInterval(() => { void refresh() }, busy ? POLL_BUSY_MS : POLL_IDLE_MS)
        return () => clearInterval(timer)
      }, [refresh, state !== null && state.scanning])

      const snapshot = state ? state.snapshot : null
      const scanning = state ? state.scanning : false
      const settings = state ? state.settings : { allowDelete: false, disabledRules: [], concurrency: 4 }
      const audit = state ? state.audit : []
      const candidates = candidatesOf(snapshot)
      const selectedBytes = candidates.filter((candidate) => selected.has(candidate.id)).reduce((sum, candidate) => sum + (candidate.bytes || 0), 0)

      const toggle = (id) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        setPlan(null)
      }

      const startScan = async () => {
        setError('')
        try { await client.scan() ; await refresh() } catch (problem) { setError(String(problem.message || problem)) }
      }

      const stopScan = async () => {
        try { await client.cancel() } catch { /* ignore */ }
      }

      const preview = async () => {
        setError('')
        try {
          const result = await client.plan([...selected])
          setPlan(result)
        } catch (problem) { setError(String(problem.message || problem)) }
      }

      const run = async () => {
        setRunning(true)
        setError('')
        try {
          const result = await client.clean([...selected])
          setPlan(result.plan ? { plan: result.plan, script: '' } : plan)
          setSelected(new Set())
          await refresh()
          if (result.freed !== undefined) setTab('audit')
        } catch (problem) {
          setError(String(problem.message || problem))
        } finally {
          setRunning(false)
        }
      }

      const patchSettings = async (patch) => {
        try {
          const result = await client.settings(patch)
          setState((previous) => (previous ? { ...previous, settings: result.settings } : previous))
        } catch (problem) { setError(String(problem.message || problem)) }
      }

      const used = snapshot ? snapshot.disk.used : 0
      const free = snapshot ? snapshot.disk.free : 0
      const total = snapshot ? snapshot.disk.total : 0

      return h('div', { className: 'dl-root', 'data-dsh-plugin': 'disk-lens' },
        h('header', { className: 'dl-head' },
          h('div', { className: 'dl-brand' },
            h('div', { className: 'dl-brand-mark' }, h('i'), 'disk lens'),
            h('h1', { className: 'dl-title' }, '盘面'),
            h('p', { className: 'dl-sub' }, '规则先量一遍，模型再补充判断。所有建议都写明做什么、删哪里，勾选后才执行；默认进废纸篓。')
          ),
          h('div', { className: 'dl-hero' },
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num is-hot' }, rmBytes(used)),
              h('span', { className: 'dl-hero-cap' }, '已用')
            ),
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num' }, rmBytes(free)),
              h('span', { className: 'dl-hero-cap' }, '可用')
            ),
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num' }, total > 0 ? Math.round((used / total) * 100) + '%' : '—'),
              h('span', { className: 'dl-hero-cap' }, '占用')
            )
          ),
          h('div', { className: 'dl-actions' },
            scanning
              ? h('button', { className: 'dl-btn is-quiet', onClick: stopScan }, '停止扫描')
              : h('button', { className: 'dl-btn is-primary', onClick: startScan }, '开始扫描'),
            h('button', { className: 'dl-btn', onClick: () => { void refresh() } }, '刷新')
          )
        ),

        scanning && state.progress ? h('div', { className: 'dl-progress' },
          h('span', null, '测量 ' + state.progress.done + ' / ' + state.progress.total),
          h('div', { className: 'dl-progress-bar' }, h('i', { style: { width: Math.round(100 * (state.progress.done / Math.max(1, state.progress.total))) + '%' } })),
          h('span', null, state.progress.path || '')
        ) : null,

        error !== '' ? h('div', { className: 'dl-error' }, error) : null,

        h(CapacityBar, { snapshot, scanning, progress: state ? state.progress : null, active, onSelect: setActive }),

        h('div', { className: 'dl-grid' },
          h(CategoryList, { snapshot, active, onSelect: setActive }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
            h(SuggestionList, { snapshot, selected, onToggle: toggle }),
            candidates.length > 0 ? h('div', { className: 'dl-plan' },
              h('div', { className: 'dl-plan-foot' },
                h('span', null, '已选 ' + selected.size + ' 条，约 ' + rmBytes(selectedBytes)),
                h('div', { className: 'dl-actions', style: { marginLeft: 'auto' } },
                  h('button', { className: 'dl-btn is-quiet', disabled: selected.size === 0, onClick: preview }, '预览脚本'),
                  h('button', {
                    className: 'dl-btn is-primary',
                    disabled: selected.size === 0 || running,
                    onClick: run,
                  }, running ? '正在清理…' : '执行清理')
                )
              ),
              plan && plan.script ? h('pre', null, plan.script) : null
            ) : null
          )
        ),

        h('section', { className: 'dl-panel' },
          h('div', { className: 'dl-panel-head' },
            h('div', { className: 'dl-tabs' },
              h('button', { className: 'dl-tab', 'data-on': tab === 'audit', onClick: () => setTab('audit') }, '审计'),
              h('button', { className: 'dl-tab', 'data-on': tab === 'settings', onClick: () => setTab('settings') }, '设置'),
              h('button', { className: 'dl-tab', 'data-on': tab === 'about', onClick: () => setTab('about') }, '说明')
            ),
            h('span', null, snapshot ? snapshot.categories.length + ' 类 · ' + candidates.length + ' 条建议' : '')
          ),
          tab === 'audit'
            ? h('div', { className: 'dl-audit', style: { padding: '14px' } },
                audit.length === 0 ? h('div', { className: 'dl-empty' }, '还没有记录。') :
                audit.map((row, index) => h('div', { key: 'audit-' + index, className: 'dl-audit-row' },
                  h('span', null, shortDate(row.at)),
                  h('span', null, row.kind || ''),
                  h('span', null, row.kind === 'scan' ? '规则 ' + (row.rules || 0) + ' 条，' + Math.round((row.durationMs || 0) / 1000) + ' 秒'
                    : row.kind === 'clean' ? '释放约 ' + rmBytes(row.freed || 0) + '，' + (row.ids || []).length + ' 条'
                    : row.kind === 'propose' ? '写入 ' + (row.categories || 0) + ' 个分类'
                    : JSON.stringify(row).slice(0, 120))
                )))
            : null,
          tab === 'settings'
            ? h('div', { className: 'dl-settings' },
                h('div', { className: 'dl-switch' },
                  h('div', null, '允许直接删除', h('small', null, '关闭时，delete 类建议会被拒绝，所有非命令清理都进废纸篓。')),
                  h('button', { 'data-on': settings.allowDelete ? 'true' : 'false', onClick: () => patchSettings({ allowDelete: !settings.allowDelete }) }, h('i'))
                ),
                h('div', { className: 'dl-switch' },
                  h('div', null, '并行测量', h('small', null, '同时跑几个 du；机械硬盘建议 2，SSD 可以到 6。')),
                  h('div', { className: 'dl-tabs' },
                    [1, 2, 4, 6].map((value) => h('button', {
                      key: 'conc-' + value,
                      className: 'dl-tab',
                      'data-on': (settings.concurrency || 4) === value,
                      onClick: () => patchSettings({ concurrency: value }),
                    }, String(value)))
                  )
                ),
                h('div', { className: 'dl-switch' },
                  h('div', null, '规则', h('small', null, '按需关掉不想扫的规则；关掉后扫描更快。')),
                  h('div', { className: 'dl-tabs' },
                    (state ? state.rules : []).slice(0, 8).map((rule) => h('button', {
                      key: 'rule-' + rule.id,
                      className: 'dl-tab',
                      'data-on': !(settings.disabledRules || []).includes(rule.id),
                      onClick: () => {
                        const disabled = new Set(settings.disabledRules || [])
                        if (disabled.has(rule.id)) disabled.delete(rule.id)
                        else disabled.add(rule.id)
                        void patchSettings({ disabledRules: [...disabled] })
                      },
                    }, rule.name))
                  )
                )
              )
            : null,
          tab === 'about'
            ? h('div', { style: { padding: '16px 18px', color: 'var(--dl-dim)', fontSize: '12.5px', lineHeight: '1.7' } },
                h('p', null, '这个面板只做三件事：量、建议、执行。量是 du 加规则表；建议来自规则与被你允许的模型；执行前会给你完整脚本，默认全部进废纸篓。'),
                h('p', null, '想加一条自己的规则，改插件目录下的 ', h('code', null, 'src/host/rules.js'), '，刷新即生效。模型分析在对话里说「分析一下磁盘」即可，它会调用 disk_scan / disk_propose。')
              )
            : null
        )
      )
    }

    function DiskLensIcon() {
      return h('svg', { width: '18', height: '18', viewBox: '0 0 18 18', 'aria-hidden': 'true' },
        h('path', { d: 'M2 13.5 2 15h14v-1.5H2Z', fill: 'currentColor', opacity: 0.45 }),
        h('path', { d: 'M2.5 10.2c2.6-2.6 4.2.6 6.6-1.4 2-1.7 3.4-1 6.4.9v3.3h-13v-2.8Z', fill: 'currentColor', opacity: 0.75 }),
        h('path', { d: 'M4.5 6.6c1.9-2 3.4-.4 5.2-1.9 1.3-1.1 2.6-.3 4.1.9V9c-2.6-1.8-4-2.4-5.8-.8-2 1.8-3.4-.8-5.4 1.1V6.4l1.9.2Z', fill: 'currentColor' })
      )
    }

    function install(ctx) {
      ctx.inject(['slots'], (scope) => {
        const disposers = []
        const api = new Api()
        disposers.push(scope.slots.inject('sidebar.panellist', () => scope.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 36,
          label: () => '盘面',
        }, DiskLensIcon)))
        disposers.push(scope.slots.inject('main', () => scope.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => ({ api }),
        }, DiskLensPage)))
        return () => { for (const dispose of disposers.splice(0)) dispose() }
      }, 'dsh-disk-lens: panel')
    }

    const moduleValue = { exports: {} }
    moduleValue.exports.apply = install
    moduleValue.exports.inject = ['slots']
    return moduleValue.exports
  },
})