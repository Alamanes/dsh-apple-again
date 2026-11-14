/**
 * dsh-apple-purge browser half — the console panel.
 *
 * A sidebar row plus one main-slot page, drawn with the suite's design tokens so
 * it reads as part of the shell rather than an embedded app. Every control talks
 * to this package's own host routes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-apple-purge',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React
    const PANEL_ID = 'apple-purge'
    const API = 'dsh-apple-purge'
    const GROUP_LABEL = { whiten: '洗白', persist: '持久化', approval: '审批沙箱' }
    const STATE_LABEL = { applied: '已应用', pending: '未应用', missing_file: '未找到' }

    const CSS = `
.ap-root { height: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 26px 30px 48px; color: var(--dshui-text-primary); font-family: var(--dshui-font-family, inherit); }
.ap-root, .ap-root * { box-sizing: border-box; max-width: 100%; }
.ap-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.ap-title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.01em; }
.ap-version { color: var(--dshui-text-dimmed); font-size: 12px; }
.ap-sub { margin: 0 0 22px; color: var(--dshui-text-tertiary); font-size: 12.5px; line-height: 1.6; overflow-wrap: anywhere; }
.ap-sub code { color: var(--dshui-text-secondary); font-size: 12px; }
.ap-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 26px; }
.ap-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid var(--dshui-border-1); border-radius: 10px; background: transparent; }
.ap-card-name { font-size: 13.5px; color: var(--dshui-text-primary); }
.ap-card-note { margin-top: 3px; font-size: 11.5px; color: var(--dshui-text-tertiary); }
.ap-switch { position: relative; flex: none; width: 36px; height: 20px; border-radius: 10px; border: 1px solid var(--dshui-border-1); background: transparent; cursor: pointer; transition: background var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease); }
.ap-switch i { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dshui-text-dimmed); transition: transform var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease), background var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease); }
.ap-switch[data-on="true"] { border-color: var(--dshui-brand); }
.ap-switch[data-on="true"] i { transform: translateX(16px); background: var(--dshui-brand); }
.ap-switch:disabled { opacity: 0.5; }
.ap-block { margin-bottom: 26px; }
.ap-block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ap-block-title { font-size: 13px; font-weight: 600; color: var(--dshui-text-secondary); }
.ap-block-note { margin-left: auto; font-size: 11.5px; color: var(--dshui-text-tertiary); }
.ap-editor { width: 100%; min-height: 260px; max-height: 46vh; resize: vertical; padding: 14px 16px; border: 1px solid var(--dshui-border-1); border-radius: 10px; background: transparent; color: var(--dshui-text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.75; outline: none; }
.ap-editor:focus { border-color: var(--dshui-brand); }
.ap-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ap-btn { padding: 6px 13px; border: 1px solid var(--dshui-border-1); border-radius: 8px; background: transparent; color: var(--dshui-text-secondary); font-size: 12.5px; font-family: inherit; cursor: pointer; transition: border-color var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease), color var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease), background var(--dshui-duration-fast, 120ms) var(--dshui-ease-standard, ease); }
.ap-btn:hover:not(:disabled) { background: var(--dshui-surface-hover); color: var(--dshui-text-primary); }
.ap-btn:disabled { opacity: 0.45; cursor: default; }
.ap-btn-primary { border-color: var(--dshui-brand); color: var(--dshui-brand); }
.ap-btn-primary:hover:not(:disabled) { background: var(--dshui-brand-fill); color: var(--dshui-text-on-brand); }
.ap-note { font-size: 12px; color: var(--dshui-text-tertiary); }
.ap-note[data-kind="error"] { color: var(--dshui-danger); }
.ap-meta { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; color: var(--dshui-text-secondary); overflow-wrap: anywhere; }
.ap-meta b { font-weight: 600; }
.ap-meta .ap-drift { color: var(--dshui-brand); }
.ap-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12.5px; }
.ap-table th { padding: 7px 10px; text-align: left; font-weight: 500; color: var(--dshui-text-tertiary); border-bottom: 1px solid var(--dshui-border-1); }
.ap-table td { padding: 7px 10px; border-bottom: 1px solid var(--dshui-border-1); color: var(--dshui-text-secondary); }
.ap-table td.ap-id { color: var(--dshui-text-dimmed); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; width: 52px; }
.ap-table td.ap-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-state { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; }
.ap-state::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
.ap-state[data-s="applied"] { color: #58c98a; }
.ap-state[data-s="pending"] { color: #e2a94a; }
.ap-state[data-s="missing_file"] { color: var(--dshui-text-dimmed); }
@media (max-width: 720px) { .ap-grid { grid-template-columns: 1fr; } }
`

    function injectStyle() {
      if (document.getElementById('ap-style') !== null) return
      const style = document.createElement('style')
      style.id = 'ap-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function call(path, options) {
      return fetch(API + path, {
        headers: { 'content-type': 'application/json' },
        ...options,
      }).then((response) => response.json()).then((value) => {
        if (value === null || typeof value !== 'object' || value.ok !== true) {
          throw new Error(String(value && value.error || 'request failed'))
        }
        return value
      })
    }

    function Switch({ on, disabled, onChange }) {
      return h('button', {
        className: 'ap-switch',
        'data-on': String(Boolean(on)),
        disabled: Boolean(disabled),
        'aria-checked': String(Boolean(on)),
        role: 'switch',
        onClick: onChange,
      }, h('i'))
    }

    function Card({ name, note, on, disabled, onToggle }) {
      return h('div', { className: 'ap-card' },
        h('div', null,
          h('div', { className: 'ap-card-name' }, name),
          h('div', { className: 'ap-card-note' }, note),
        ),
        h(Switch, { on, disabled, onChange: onToggle }),
      )
    }

    function Panel() {
      const [status, setStatus] = useState(null)
      const [text, setText] = useState('')
      const [dirty, setDirty] = useState(false)
      const [busy, setBusy] = useState('')
      const [note, setNote] = useState({ kind: '', text: '' })
      const [upstream, setUpstream] = useState(null)
      const mounted = useRef(true)

      const load = useCallback(() => {
        return Promise.all([call('/status'), call('/text')]).then(([state, body]) => {
          if (!mounted.current) return
          setStatus(state)
          setText((current) => (dirty ? current : body.text))
        }).catch((error) => {
          if (mounted.current) setNote({ kind: 'error', text: String(error?.message ?? error) })
        })
      }, [dirty])

      const loadUpstream = useCallback((force) => {
        return call('/update' + (force ? '?force=1' : '')).then((value) => {
          if (mounted.current) setUpstream(value)
        }).catch((error) => {
          if (mounted.current) setNote({ kind: 'error', text: String(error?.message ?? error) })
        })
      }, [])

      useEffect(() => {
        mounted.current = true
        injectStyle()
        void load()
        void loadUpstream(false)
        return () => { mounted.current = false }
      }, [load, loadUpstream])

      const toggle = (key) => {
        if (status === null) return
        const next = !status.modules[key]
        setBusy(key)
        void call('/module', { method: 'POST', body: JSON.stringify({ key, enabled: next }) })
          .then(() => load())
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const save = () => {
        setBusy('save')
        void call('/text', { method: 'POST', body: JSON.stringify({ text }) })
          .then(() => { setDirty(false); setNote({ kind: '', text: '已保存，下一轮生效' }) })
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const reset = () => {
        setBusy('reset')
        void call('/reset', { method: 'POST', body: '{}' })
          .then((value) => { setText(value.text); setDirty(false); setNote({ kind: '', text: '已恢复默认' }) })
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const loadFull = () => {
        setBusy('full')
        void call('/full')
          .then((value) => { setText(value.text); setDirty(true); setNote({ kind: '', text: '已载入完整原版，尚未保存' }) })
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const backupHost = () => {
        setBusy('backup')
        void call('/backup', { method: 'POST', body: '{}' })
          .then(() => setNote({ kind: '', text: '已备份宿主文件（.applepurge.bak）' }))
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const applyPatches = () => {
        setBusy('apply')
        void call('/apply', { method: 'POST', body: '{}' })
          .then(() => { setNote({ kind: '', text: '补丁已写入宿主，重启后生效' }); return load() })
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const revertPatches = () => {
        setBusy('revert')
        void call('/revert', { method: 'POST', body: '{}' })
          .then(() => { setNote({ kind: '', text: '已从备份回滚' }); return load() })
          .catch((error) => setNote({ kind: 'error', text: String(error?.message ?? error) }))
          .finally(() => setBusy(''))
      }

      const counts = status?.counts ?? {}
      const groups = status?.groups ?? []
      const modules = status?.modules ?? {}
      const rows = status?.patches ?? []

      return h('div', { className: 'ap-root' },
        h('div', { className: 'ap-head' },
          h('h2', { className: 'ap-title' }, '限制'),
          h('span', { className: 'ap-version' }, 'v' + String(status?.version ?? '—')),
        ),
        h('p', { className: 'ap-sub' },
          '提示词洗白与持久化。宿主 ',
          h('code', null, status?.base || '未定位'),
          '  ·  已应用 ' + String(counts.applied ?? 0) + ' / 未应用 ' + String(counts.pending ?? 0),
        ),

        h('div', { className: 'ap-grid' },
          groups.map((group) => h(Card, {
            key: group.key,
            name: group.label,
            note: String(group.count) + ' 条',
            on: Boolean(modules[group.key]),
            disabled: busy === group.key,
            onToggle: () => toggle(group.key),
          })),
        ),

        h('section', { className: 'ap-block' },
          h('div', { className: 'ap-block-head' },
            h('span', { className: 'ap-block-title' }, '注入正文'),
            h('span', { className: 'ap-block-note' }, String(text.length) + ' 字符' + (dirty ? ' · 未保存' : '')),
          ),
          h('textarea', {
            className: 'ap-editor',
            value: text,
            spellCheck: false,
            onChange: (event) => { setText(event.target.value); setDirty(true) },
          }),
          h('div', { className: 'ap-actions' },
            h('button', { className: 'ap-btn ap-btn-primary', disabled: busy === 'save', onClick: save }, '保存'),
            h('button', { className: 'ap-btn', disabled: busy === 'reset', onClick: reset }, '恢复默认'),
            h('button', { className: 'ap-btn', disabled: busy === 'full', onClick: loadFull }, '载入完整原版'),
            note.text !== '' ? h('span', { className: 'ap-note', 'data-kind': note.kind }, note.text) : null,
          ),
        ),

        h('section', { className: 'ap-block' },
          h('div', { className: 'ap-block-head' },
            h('span', { className: 'ap-block-title' }, '上游锚点'),
            h('span', { className: 'ap-block-note' }, upstream?.checkedAt ? new Date(upstream.checkedAt).toLocaleString() : ''),
          ),
          h('div', { className: 'ap-meta' },
            h('span', null, '依赖上游 ', h('b', null, upstream?.baseline ?? '—')),
            h('span', null, '上游最新 ', h('b', null, upstream?.latest || '—')),
            h('span', { className: upstream?.hasDrift ? 'ap-drift' : '' },
              upstream?.hasDrift ? '有差异，需复核锚点' : '无差异'),
          ),
          h('div', { className: 'ap-actions' },
            h('button', { className: 'ap-btn', disabled: busy === 'update', onClick: () => { setBusy('update'); void loadUpstream(true).finally(() => setBusy('')) } }, '检查上游'),
            h('button', { className: 'ap-btn', disabled: busy === 'backup', onClick: backupHost }, '备份宿主'),
            h('button', { className: 'ap-btn', disabled: busy === 'apply', onClick: applyPatches }, '应用到宿主'),
            h('button', { className: 'ap-btn', disabled: busy === 'revert', onClick: revertPatches }, '从备份回滚'),
            upstream?.url ? h('a', {
              href: upstream.url,
              target: '_blank',
              rel: 'noreferrer',
              className: 'ap-btn',
              style: { marginLeft: 'auto', textDecoration: 'none' },
            }, '发行页') : null,
            upstream?.error ? h('span', { className: 'ap-note', 'data-kind': 'error' }, upstream.error) : null,
          ),
        ),

        h('section', { className: 'ap-block' },
          h('div', { className: 'ap-block-head' },
            h('span', { className: 'ap-block-title' }, '补丁清单'),
            h('span', { className: 'ap-block-note' }, String(rows.length) + ' 条'),
          ),
          h('table', { className: 'ap-table' },
            h('thead', null, h('tr', null,
              h('th', null, '#'), h('th', null, '名称'), h('th', null, '分组'), h('th', null, '状态'),
            )),
            h('tbody', null, rows.map((row) => h('tr', { key: row.id },
              h('td', { className: 'ap-id' }, String(row.id)),
              h('td', { className: 'ap-name' }, row.name),
              h('td', null, GROUP_LABEL[row.group] ?? row.group ?? ''),
              h('td', null, h('span', { className: 'ap-state', 'data-s': row.state }, STATE_LABEL[row.state] ?? row.state)),
            ))),
          ),
        ),
      )
    }

    function Icon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M8 1.6 13.4 3.7v3.9c0 3.3-2.4 5.6-5.4 6.8-3-1.2-5.4-3.5-5.4-6.8V3.7z' }),
        h('path', { d: 'M5.9 6.1 10.1 9.9' }),
      )
    }

    function Page() {
      return h('div', { style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } }, h(Panel))
    }

    function apply(ctx) {
      ctx.inject(['slots'], (scope) => {
        const disposers = []
        try {
          disposers.push(scope.slots.inject('sidebar.panellist', () => scope.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 63,
            label: () => '限制',
          }, Icon)))
        } catch (error) {
          console.warn('dsh-apple-purge: sidebar row not registered', error)
        }
        try {
          disposers.push(scope.slots.inject('main', () => scope.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({}),
          }, Page)))
        } catch (error) {
          console.warn('dsh-apple-purge: page not registered', error)
        }
        scope.effect(() => () => {
          for (const dispose of disposers.splice(0)) {
            if (typeof dispose === 'function') dispose()
          }
        }, 'dsh-apple-purge: mounts')
      })
    }

    const module = { exports: {} }
    module.exports.apply = apply
    module.exports.inject = []
    return module.exports
  },
})
