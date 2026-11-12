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

    const STATUS_TEXT = { ok: '', missing: '不存在', denied: '无权限', timeout: '测量超时', failed: '测量失败', cancel: '已取消' }

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
      chat() { return this.get('/chat') }
      chatSend(text) { return this.post('/chat/send', { text }) }
      chatCancel() { return this.post('/chat/cancel', {}) }
      chatClear() { return this.post('/chat/clear', {}) }
      models() { return this.get('/models') }
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
                onClick: segment.id === '__rest' ? undefined : () => onSelect(active === segment.id ? '' : segment.id),
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
                onClick: segment.id === '__rest' ? undefined : () => onSelect(active === segment.id ? '' : segment.id),
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
                      h('div', { key: category.id + '-item-' + index, className: 'dl-cat-item' + (item.status !== 'ok' ? ' is-denied' : '') },
                        h('span', null, item.label + (STATUS_TEXT[item.status] ? '（' + STATUS_TEXT[item.status] + '）' : '')),
                        h('b', null, rmBytes(item.bytes))
                      )))
                  : null
              ),
              h('span', { className: 'dl-cat-size' }, rmBytes(category.bytes))
            ))
      )
    }

    /* ---------- suggestions ---------- */

    function SuggestionList({ snapshot, selected, onToggle, allowDelete }) {
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
                    candidate.origin === 'model' ? h('span', { className: 'dl-tag is-model' }, '模型') : null,
                    candidate.method === 'delete' && !allowDelete ? h('span', { className: 'dl-tag is-careful' }, '需开启删除') : null
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

    /* ---------- audit & settings ---------- */

    const AUDIT_KIND = { scan: '扫描', propose: '写入建议', clean: '清理' }

    function auditLine(row) {
      if (row.kind === 'scan') return '规则 ' + (row.rules || 0) + ' 条 · ' + Math.round((row.durationMs || 0) / 1000) + ' 秒'
      if (row.kind === 'clean') return '释放约 ' + rmBytes(row.freed || 0) + ' · ' + (row.ids || []).length + ' 条'
      if (row.kind === 'propose') return '写入 ' + (row.categories || 0) + ' 个分类' + (row.refused ? ' · 拒绝 ' + row.refused + ' 条' : '')
      return JSON.stringify(row).slice(0, 80)
    }

    function AuditPanel({ audit }) {
      return h('section', { className: 'dl-panel' },
        h('div', { className: 'dl-panel-head' }, h('h3', null, '审计'), h('span', null, audit.length + ' 条记录')),
        h('div', { className: 'dl-audit' },
          audit.length === 0
            ? h('div', { className: 'dl-empty' }, '还没有记录。每次扫描、写入建议、清理都会记在这里。')
            : audit.map((row, index) => h('div', { key: 'audit-' + index, className: 'dl-audit-row' },
                h('span', null, shortDate(row.at)),
                h('span', null, AUDIT_KIND[row.kind] || row.kind || ''),
                h('span', null, auditLine(row))
              ))
        )
      )
    }

    function SettingsPanel({ settings, rules, models, onPatch, busy }) {
      const disabled = new Set(settings.disabledRules || [])
      const enabledCount = rules.filter((rule) => !disabled.has(rule.id)).length
      return h('section', { className: 'dl-panel' },
        h('div', { className: 'dl-panel-head' },
          h('h3', null, '设置'),
          h('span', null, '规则 ' + enabledCount + ' / ' + rules.length)
        ),
        h('div', { className: 'dl-settings' },
          h(ModelPicker, { models, chatModel: settings.chatModel, onPatch, busy }),
          h('div', { className: 'dl-switch' },
            h('div', null, '允许直接删除', h('small', null, '关闭时 delete 类建议会被拒绝，其余清理都进废纸篓。')),
            h('button', { 'data-on': settings.allowDelete ? 'true' : 'false', disabled: busy, onClick: () => onPatch({ allowDelete: !settings.allowDelete }) }, h('i'))
          ),
          h('div', { className: 'dl-switch' },
            h('div', null, '并行测量', h('small', null, '同时跑几个 du；机械硬盘用 2，SSD 可以到 6。')),
            h('div', { className: 'dl-tabs' },
              [1, 2, 4, 6].map((value) => h('button', {
                key: 'conc-' + value,
                className: 'dl-tab',
                'data-on': (settings.concurrency || 4) === value,
                disabled: busy,
                onClick: () => onPatch({ concurrency: value }),
              }, String(value)))
            )
          ),
          h('div', { className: 'dl-switch is-column' },
            h('div', null, '规则', h('small', null, '关掉的规则不参与扫描，也不会生成建议。')),
            h('div', { className: 'dl-chips' },
              rules.map((rule) => {
                const on = !disabled.has(rule.id)
                return h('button', {
                  key: 'rule-' + rule.id,
                  className: 'dl-chip-btn',
                  'data-on': on,
                  disabled: busy,
                  onClick: () => {
                    const next = new Set(disabled)
                    if (next.has(rule.id)) next.delete(rule.id)
                    else next.add(rule.id)
                    onPatch({ disabledRules: [...next] })
                  },
                }, rule.name)
              })
            )
          )
        )
      )
    }

    /* ---------- dialogs ---------- */

    function ConfirmDialog({ pending, cleaning, allowDelete, onCancel, onConfirm }) {
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape' && !cleaning) onCancel() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [cleaning, onCancel])
      const blockedDelete = pending.hasDelete && !allowDelete
      return h('div', { className: 'dl-backdrop', onClick: () => { if (!cleaning) onCancel() } },
        h('div', { className: 'dl-modal', role: 'dialog', 'aria-modal': 'true', onClick: (event) => event.stopPropagation() },
          h('div', { className: 'dl-modal-head' },
            h('h3', null, '确认执行 ' + pending.count + ' 条清理'),
            h('p', null, '将释放约 ' + rmBytes(pending.bytes) + '。下面是会跑的全部命令；非命令类默认进废纸篓，可以恢复。')
          ),
          blockedDelete
            ? h('div', { className: 'dl-warn' }, '其中包含直接删除的条目，设置里没有打开删除开关，这些会被跳过。')
            : null,
          h('pre', { className: 'dl-script' }, pending.script),
          h('div', { className: 'dl-modal-foot' },
            h('span', null, '执行结果会写进下面的审计。'),
            h('div', { className: 'dl-actions' },
              h('button', { className: 'dl-btn is-quiet', disabled: cleaning, onClick: onCancel }, '取消'),
              h('button', { className: 'dl-btn is-primary', disabled: cleaning, onClick: onConfirm }, cleaning ? '正在清理…' : '确认执行')
            )
          )
        )
      )
    }

    function Toast({ result, onClose }) {
      useEffect(() => {
        const timer = setTimeout(onClose, 6000)
        return () => clearTimeout(timer)
      }, [result, onClose])
      const done = result.results.filter((row) => row.state === 'done').length
      const failed = result.results.filter((row) => row.state === 'failed').length
      return h('div', { className: 'dl-toast', role: 'status' },
        h('b', null, '清理完成'),
        h('span', null, '释放约 ' + rmBytes(result.freed) + ' · 成功 ' + done + (failed > 0 ? ' · 失败 ' + failed : '')),
        h('button', { className: 'dl-toast-close', 'aria-label': '关闭', onClick: onClose }, '×')
      )
    }

    /* ---------- chat ---------- */

    function ChatPanel({ chat, input, onInput, onSend, onStop, onClear }) {
      const scroller = useRef(null)
      const messages = chat ? chat.messages : []
      const running = chat ? chat.running : false
      const error = chat ? chat.error : ''
      const modelName = chat && chat.model ? String(chat.model.model).split('/').pop() : '未选模型'

      useEffect(() => {
        const node = scroller.current
        if (node !== null) node.scrollTop = node.scrollHeight
      }, [messages.length, running, (messages[messages.length - 1] || {}).blocks])

      return h('section', { className: 'dl-panel dl-chat' },
        h('div', { className: 'dl-panel-head' },
          h('h3', null, '对话'),
          h('span', null, modelName)
        ),
        h('div', { className: 'dl-chat-log', ref: scroller },
          messages.length === 0
            ? h('div', { className: 'dl-empty' }, '问一句磁盘上的事。模型可以调用扫描、读快照、提交建议，面板会跟着更新。')
            : messages.map((message) => h('div', { key: message.id, className: 'dl-msg is-' + message.role },
                message.role === 'user'
                  ? h('div', { className: 'dl-bubble' }, message.text)
                  : h('div', { className: 'dl-bubble' },
                      (message.blocks || []).map((block, index) => {
                        if (block.type === 'text') return h('p', { key: 'b' + index, className: 'dl-msg-text' }, block.text)
                        if (block.type === 'tool') {
                          return h('div', { key: 'b' + index, className: 'dl-tool is-' + block.state },
                            h('span', { className: 'dl-tool-name' }, block.name),
                            h('span', { className: 'dl-tool-detail' }, block.detail || (block.state === 'running' ? '运行中…' : ''))
                          )
                        }
                        return null
                      }),
                      message.streaming ? h('span', { className: 'dl-cursor' }) : null
                    )
              ))
        ),
        error !== '' ? h('div', { className: 'dl-chat-error' }, error) : null,
        h('div', { className: 'dl-chat-input' },
          h('textarea', {
            value: input,
            rows: 2,
            placeholder: '让模型分析磁盘，或问某个目录为什么这么大…',
            onChange: (event) => onInput(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            },
          }),
          h('div', { className: 'dl-chat-actions' },
            h('button', { className: 'dl-btn is-quiet', disabled: messages.length === 0 || running, onClick: onClear }, '清空'),
            running
              ? h('button', { className: 'dl-btn is-quiet', onClick: onStop }, '停止')
              : h('button', { className: 'dl-btn is-primary', disabled: input.trim() === '', onClick: onSend }, '发送')
          )
        )
      )
    }

    function ModelPicker({ models, chatModel, onPatch, busy }) {
      const providers = (models && models.providers) || []
      const current = chatModel || (models && models.selection) || null
      const provider = providers.find((item) => item.id === (current && current.provider)) || providers[0]
      const model = provider ? provider.models.find((item) => item.id === (current && current.model)) || provider.models[0] : null
      const efforts = (model && model.efforts) || []
      const effort = (current && current.reasoningEffort) || 'low'

      if (providers.length === 0) return h('div', { className: 'dl-switch' }, h('div', null, '对话模型', h('small', null, '没有可用的模型提供商。')))

      const commit = (nextProvider, nextModel, nextEffort) => {
        onPatch({ chatModel: { provider: nextProvider.id, model: nextModel.id, reasoningEffort: nextEffort } })
      }

      return h('div', { className: 'dl-switch is-column' },
        h('div', null, '对话模型', h('small', null, '面板里的对话用这个模型；与主会话的模型互不影响。')),
        h('div', { className: 'dl-model-row' },
          h('select', {
            value: provider.id,
            disabled: busy,
            onChange: (event) => {
              const next = providers.find((item) => item.id === event.target.value) || providers[0]
              const first = next.models[0]
              commit(next, first, (first.efforts[0] && first.efforts[0].id) || 'low')
            },
          }, providers.map((item) => h('option', { key: item.id, value: item.id }, item.name))),
          h('select', {
            value: model ? model.id : '',
            disabled: busy,
            onChange: (event) => {
              const next = provider.models.find((item) => item.id === event.target.value) || model
              commit(provider, next, (next.efforts[0] && next.efforts[0].id) || 'low')
            },
          }, provider.models.map((item) => h('option', { key: item.id, value: item.id }, item.name)))
        ),
        efforts.length > 0
          ? h('div', { className: 'dl-tabs' }, efforts.map((item) => h('button', {
              key: item.id,
              className: 'dl-tab',
              'data-on': effort === item.id,
              disabled: busy,
              onClick: () => commit(provider, model, item.id),
            }, item.name)))
          : null
      )
    }

    /* ---------- page ---------- */

    function DiskLensPage({ api }) {
      const client = useMemo(() => api || new Api(), [api])
      const [state, setState] = useState(null)
      const [active, setActive] = useState('')
      const [selected, setSelected] = useState(() => new Set())
      const [pending, setPending] = useState(null)
      const [result, setResult] = useState(null)
      const [busy, setBusy] = useState('idle')
      const [error, setError] = useState('')
      const [chat, setChat] = useState(null)
      const [chatInput, setChatInput] = useState('')
      const [models, setModels] = useState(null)
      const mounted = useRef(true)
      const cleanedUp = useCallback(() => setResult(null), [])

      useEffect(() => { ensureStyle(); return () => { mounted.current = false } }, [])

      const refresh = useCallback(async () => {
        try {
          const next = await client.state()
          if (!mounted.current) return
          setState(next)
        } catch (problem) {
          if (mounted.current) setError(problem instanceof Error ? problem.message : String(problem))
        }
      }, [client])

      useEffect(() => {
        void refresh()
        const busyPoll = state !== null && state.scanning
        const timer = setInterval(() => { void refresh() }, busyPoll ? POLL_BUSY_MS : POLL_IDLE_MS)
        return () => clearInterval(timer)
      }, [refresh, state !== null && state.scanning])

      const chatRunning = chat !== null && chat.running

      useEffect(() => {
        let alive = true
        const tick = async () => {
          try {
            const next = await client.chat()
            if (alive && mounted.current) setChat(next)
          } catch { /* keep the last view */ }
        }
        void tick()
        const timer = setInterval(tick, chatRunning ? 450 : 1600)
        return () => { alive = false; clearInterval(timer) }
      }, [client, chatRunning])

      useEffect(() => {
        if (models !== null) return
        void client.models().then((next) => { if (mounted.current) setModels(next) }).catch(() => {})
      }, [client, models])

      const sendChat = async () => {
        const text = chatInput.trim()
        if (text === '' || (chat !== null && chat.running)) return
        setChatInput('')
        try {
          await client.chatSend(text)
          const next = await client.chat()
          if (mounted.current) setChat(next)
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        }
      }

      const stopChat = async () => {
        try { await client.chatCancel() } catch { /* the poll shows the truth */ }
      }

      const clearChat = async () => {
        try {
          await client.chatClear()
          const next = await client.chat()
          if (mounted.current) setChat(next)
        } catch { /* ignore */ }
      }

      const snapshot = state ? state.snapshot : null
      const scanning = state ? state.scanning : false
      const settings = state ? state.settings : { allowDelete: false, disabledRules: [], concurrency: 4 }
      const rules = state ? state.rules : []
      const audit = state ? state.audit : []
      const progress = state ? state.progress : null
      const candidates = candidatesOf(snapshot)
      const candidateKey = candidates.map((candidate) => candidate.id).join('|')

      // A new scan or a finished clean can remove suggestions; drop stale ticks.
      useEffect(() => {
        setSelected((previous) => {
          const alive = new Set(candidateKey === '' ? [] : candidateKey.split('|'))
          const next = new Set()
          for (const id of previous) if (alive.has(id)) next.add(id)
          return next.size === previous.size ? previous : next
        })
      }, [candidateKey])

      const selectedList = candidates.filter((candidate) => selected.has(candidate.id))
      const selectedBytes = selectedList.reduce((sum, candidate) => sum + (candidate.bytes || 0), 0)
      const selectedHasDelete = selectedList.some((candidate) => candidate.method === 'delete')
      const hasSnapshot = snapshot !== null && snapshot.disk.total > 0
      const used = hasSnapshot ? snapshot.disk.used : 0
      const free = hasSnapshot ? snapshot.disk.free : 0
      const total = hasSnapshot ? snapshot.disk.total : 0

      const toggle = (id) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const startScan = async () => {
        setError('')
        setPending(null)
        setResult(null)
        try {
          await client.scan()
          await refresh()
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        }
      }

      const stopScan = async () => {
        try { await client.cancel() } catch { /* the next poll shows the truth */ }
        void refresh()
      }

      const requestClean = async () => {
        if (selected.size === 0) return
        setBusy('planning')
        setError('')
        try {
          const preview = await client.plan([...selected])
          const steps = (preview.plan && preview.plan.steps) || []
          setPending({
            ids: [...selected],
            script: preview.script || '',
            count: steps.length,
            bytes: steps.reduce((sum, step) => sum + (step.bytes || 0), 0),
            hasDelete: steps.some((step) => step.method === 'delete'),
          })
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy('idle')
        }
      }

      const runClean = async () => {
        if (pending === null) return
        setBusy('cleaning')
        setError('')
        try {
          const done = await client.clean(pending.ids)
          setResult({ freed: done.freed || 0, results: done.results || [] })
          setSelected(new Set())
          setPending(null)
          await refresh()
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy('idle')
        }
      }

      const patchSettings = async (patch) => {
        setBusy('settings')
        try {
          const next = await client.settings(patch)
          setState((previous) => (previous ? { ...previous, settings: next.settings } : previous))
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy('idle')
        }
      }

      const percent = hasSnapshot ? Math.round((used / total) * 100) : 0
      const progressPercent = scanning && progress && progress.total > 0 ? Math.round(100 * (progress.done / progress.total)) : 0

      return h('div', { className: 'dl-root', 'data-dsh-plugin': 'disk-lens' },
        h('header', { className: 'dl-head dl-enter' },
          h('div', { className: 'dl-brand' },
            h('div', { className: 'dl-brand-mark' }, h('i'), 'disk lens'),
            h('h1', { className: 'dl-title' }, '盘面'),
            h('p', { className: 'dl-sub' }, '规则先量一遍，模型再补充判断。每条建议都写明做什么、删哪里；勾选后先给你看脚本，确认才执行，默认进废纸篓。')
          ),
          h('div', { className: 'dl-hero' },
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num is-hot' }, hasSnapshot ? rmBytes(used) : '—'),
              h('span', { className: 'dl-hero-cap' }, '已用')
            ),
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num' }, hasSnapshot ? rmBytes(free) : '—'),
              h('span', { className: 'dl-hero-cap' }, '可用')
            ),
            h('div', { className: 'dl-hero-item' },
              h('span', { className: 'dl-hero-num' }, hasSnapshot ? percent + '%' : '—'),
              h('span', { className: 'dl-hero-cap' }, '占用')
            )
          ),
          h('div', { className: 'dl-actions' },
            scanning
              ? h('button', { className: 'dl-btn is-quiet', onClick: stopScan }, '停止扫描')
              : h('button', { className: 'dl-btn is-primary', disabled: busy !== 'idle', onClick: startScan }, '开始扫描'),
            h('button', { className: 'dl-btn', disabled: busy !== 'idle', onClick: () => { void refresh() } }, '刷新')
          )
        ),

        scanning
          ? h('div', { className: 'dl-scanbar dl-enter' },
              h('span', { className: 'dl-scanbar-cap' }, '测量中'),
              h('div', { className: 'dl-progress-bar' }, h('i', { style: { width: progressPercent + '%' } })),
              h('span', { className: 'dl-scanbar-path' }, (progress && progress.path) || '准备中…'),
              h('span', { className: 'dl-scanbar-count' }, progress ? progress.done + ' / ' + progress.total : '')
            )
          : null,

        error !== ''
          ? h('div', { className: 'dl-error-bar dl-enter' },
              h('span', null, error),
              h('button', { 'aria-label': '关闭', onClick: () => setError('') }, '×')
            )
          : null,

        h('div', { className: 'dl-enter' }, h(CapacityBar, { snapshot, scanning, progress, active, onSelect: setActive })),

        h('div', { className: 'dl-grid dl-enter' },
          h(CategoryList, { snapshot, active, onSelect: setActive }),
          h(SuggestionList, { snapshot, selected, onToggle: toggle, allowDelete: settings.allowDelete }),
          h(ChatPanel, { chat, input: chatInput, onInput: setChatInput, onSend: sendChat, onStop: stopChat, onClear: clearChat })
        ),

        candidates.length > 0
          ? h('div', { className: 'dl-actionbar dl-enter' },
              h('span', null,
                '已选 ' + selected.size + ' 条，约 ' + rmBytes(selectedBytes),
                selectedHasDelete && !settings.allowDelete ? h('em', null, ' · 其中包含直接删除，需在设置里开启') : null
              ),
              h('div', { className: 'dl-actions' },
                h('button', {
                  className: 'dl-btn is-quiet',
                  disabled: selected.size === 0 || busy !== 'idle' || scanning,
                  onClick: () => setSelected(new Set(candidates.map((candidate) => candidate.id))),
                }, '全选'),
                h('button', {
                  className: 'dl-btn is-quiet',
                  disabled: selected.size === 0 || busy !== 'idle' || scanning,
                  onClick: () => setSelected(new Set()),
                }, '清空'),
                h('button', {
                  className: 'dl-btn is-primary',
                  disabled: selected.size === 0 || busy !== 'idle' || scanning,
                  onClick: requestClean,
                }, busy === 'planning' ? '准备脚本…' : '执行清理')
              )
            )
          : null,

        h('div', { className: 'dl-bottom dl-enter' },
          h(AuditPanel, { audit }),
          h(SettingsPanel, { settings, rules, models, onPatch: patchSettings, busy: busy === 'settings' })
        ),

        h('footer', { className: 'dl-foot dl-enter' }, '规则表在插件目录的 src/host/rules.js，改完刷新即生效。在对话里说「分析一下磁盘」，模型会调用 disk_scan / disk_propose。'),

        pending !== null
          ? h(ConfirmDialog, {
              pending,
              cleaning: busy === 'cleaning',
              allowDelete: settings.allowDelete,
              onCancel: () => { if (busy !== 'cleaning') setPending(null) },
              onConfirm: runClean,
            })
          : null,

        result !== null ? h(Toast, { result, onClose: cleanedUp }) : null
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