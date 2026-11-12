// dsh-disk-lens — host half.
//
// One snapshot, one scanner, one audit log. The panel talks to the routes
// below; the model talks to the four tools. Nothing here runs a model by
// itself: a scan is deterministic, and an analysis only happens when the user
// asks for it in the chat.

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from './host/store.js'
import { createTools, candidatesOf } from './host/tools.js'
import { RULES, RULE_MAP } from './host/rules.js'
import { scanDisk } from './host/scan.js'
import { buildPlan, renderScript, executePlan, formatBytes } from './host/clean.js'
import { checkCommand, checkPath, reviewKey, displayPath } from './host/guard.js'

const LIB = dirname(fileURLToPath(import.meta.url))
const STYLE_FILE = join(LIB, '..', 'lib', 'styles.css')
const ROUTE_BASE = '/api/dsh-disk-lens'

const FAMILIES = new Set(['content', 'tools', 'caches', 'system'])
const METHODS = new Set(['trash', 'delete', 'command'])
const SAFETY = new Set(['safe', 'review', 'careful'])

function writeJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') return resolve({})
      try { resolve(JSON.parse(text)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function isLoopback(req) {
  const address = String(req.socket?.remoteAddress ?? '')
  if (address === '::1' || address.startsWith('127.')) return true
  if (address.startsWith('::ffff:')) return address.slice(7).startsWith('127.')
  // Local unix-socket style transports leave no address; the browser is same-origin.
  return address === '' || address === 'localhost'
}

export function apply(ctx, config) {
  const dshHome = config?.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dataDir = config?.dataDir ?? join(dshHome, 'storages', 'dsh-disk-lens')
  const store = createStore({ root: dataDir })
  const warn = (message) => { try { ctx.logger?.warn?.('dsh-disk-lens: ' + message) } catch { /* no logger */ } }

  const engine = {
    snapshot: null,
    scanning: false,
    cleaning: false,
    startedAt: 0,
    progress: { done: 0, total: 0, path: '' },
    error: '',
    controller: null,

    async load() {
      if (this.snapshot === null && this.loaded !== true) {
        this.loaded = true
        this.snapshot = await store.getSnapshot()
      }
      return this.snapshot
    },

    async scan({ ruleIds, signal } = {}) {
      if (this.scanning) throw new Error('已经有一次扫描在跑了')
      const settings = await store.getSettings()
      const disabled = new Set(settings.disabledRules ?? [])
      const wanted = Array.isArray(ruleIds) && ruleIds.length > 0 ? new Set(ruleIds) : null
      const rules = RULES.filter((rule) => !disabled.has(rule.id) && (wanted === null || wanted.has(rule.id)))
      if (rules.length === 0) throw new Error('没有启用任何规则')
      this.scanning = true
      this.startedAt = Date.now()
      this.error = ''
      this.progress = { done: 0, total: rules.reduce((sum, rule) => sum + rule.items.length, 0), path: '' }
      const controller = new AbortController()
      this.controller = controller
      this.canceled = false
      // Wire the caller's signal once, before any work starts.
      if (signal !== undefined) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      const forward = (event) => {
        this.progress = { done: event.done, total: event.total, path: event.path, bytes: event.bytes, status: event.status }
      }
      try {
        const snapshot = await scanDisk({ rules, concurrency: settings.concurrency ?? 4, signal: controller.signal, onProgress: forward })
        if (controller.signal.aborted) {
          // A stopped scan keeps the previous snapshot: half a measurement is
          // worse than a stale one.
          this.canceled = true
          return this.snapshot
        }
        this.snapshot = snapshot
        await store.setSnapshot(snapshot)
        await store.audit({ kind: 'scan', rules: rules.length, bytes: snapshot.accounted, durationMs: snapshot.durationMs })
        return snapshot
      } catch (error) {
        if (controller.signal.aborted) {
          this.canceled = true
          return this.snapshot
        }
        this.error = error instanceof Error ? error.message : String(error)
        warn('scan failed: ' + this.error)
        throw error
      } finally {
        this.scanning = false
        this.controller = null
        this.progress = { done: 0, total: 0, path: '' }
      }
    },

    cancel() {
      const running = this.controller !== null
      if (running) {
        this.canceled = true
        this.controller.abort()
      }
      return { cancelled: running }
    },

    propose(args) {
      if (this.snapshot === null) throw new Error('先扫描一次，再提交分类')
      const next = structuredClone(this.snapshot)
      const removed = new Set((args?.remove ?? []).map(String))
      if (removed.size > 0) next.categories = next.categories.filter((category) => !removed.has(category.id))
      const refused = []
      for (const raw of args?.categories ?? []) {
        try {
          const category = normalizeCategory(raw)
          const index = next.categories.findIndex((item) => item.id === category.id)
          if (index >= 0) next.categories[index] = category
          else next.categories.push(category)
        } catch (error) {
          refused.push((raw?.id ?? '?') + '：' + (error instanceof Error ? error.message : String(error)))
        }
      }
      if (typeof args?.headline === 'string') next.headline = args.headline
      if (typeof args?.summary === 'string') next.summary = args.summary
      next.categories.sort((a, b) => b.bytes - a.bytes)
      next.source = 'model'
      this.snapshot = next
      void store.setSnapshot(next)
      void store.audit({ kind: 'propose', categories: (args?.categories ?? []).length, refused: refused.length })
      const lines = ['已写入 ' + (args?.categories ?? []).length + ' 个分类。']
      if (refused.length > 0) lines.push('被拒绝：', ...refused)
      return lines.join('\n')
    },

    async clean(ids, { by = 'user' } = {}) {
      if (this.cleaning) throw new Error('已经有一次清理在跑')
      await this.load()
      if (this.snapshot === null) throw new Error('没有可清理的建议')
      const all = candidatesOf(this.snapshot)
      const wanted = new Set((ids ?? []).map(String))
      const selected = all.filter((candidate) => wanted.has(candidate.id))
      if (selected.length === 0) throw new Error('没有选中任何建议')
      const settings = await store.getSettings()
      const plan = buildPlan(selected, settings)
      const steps = []
      const controller = new AbortController()
      this.cleaning = true
      let result
      try {
        result = await executePlan(plan, {
          signal: controller.signal,
          settings,
          onProgress: (event) => steps.push(event),
        })
      } finally {
        this.cleaning = false
      }
      // A cleaned suggestion must leave the list, or the user will run it twice.
      const done = new Set(result.results.filter((row) => row.state === 'done').map((row) => row.stepId))
      if (done.size > 0) {
        const next = structuredClone(this.snapshot)
        next.categories = next.categories.map((category) => ({
          ...category,
          cleanup: (category.cleanup ?? []).filter((candidate) => !done.has(candidate.id)),
        }))
        next.headline = next.headline
        this.snapshot = next
        await store.setSnapshot(next)
      }
      await store.setPlan({ ...plan, script: renderScript(plan) })
      await store.audit({ kind: 'clean', by, ids: [...wanted], freed: result.freed, results: result.results })
      return { ...result, plan, steps }
    },
  }

  function normalizeCategory(raw) {
    const id = String(raw?.id ?? '').trim()
    if (id === '') throw new Error('分类缺少 id')
    if (!FAMILIES.has(raw?.family)) throw new Error('family 只能是 content/tools/caches/system')
    const bytes = Number(raw?.bytes)
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('bytes 必须是数字')
    const cleanup = (raw?.cleanup ?? []).map((candidate) => normalizeCandidate(candidate, id))
    return {
      id,
      family: raw.family,
      name: String(raw.name ?? id),
      note: String(raw.note ?? ''),
      readOnly: false,
      bytes,
      items: (raw?.items ?? []).map((item) => ({
        label: String(item?.label ?? ''),
        path: String(item?.path ?? ''),
        bytes: Number(item?.bytes) || 0,
        status: 'ok',
      })),
      cleanup,
    }
  }

  function normalizeCandidate(raw, categoryId) {
    const id = String(raw?.id ?? '').trim()
    if (id === '') throw new Error('清理建议缺少 id')
    const method = String(raw?.method ?? '')
    if (!METHODS.has(method)) throw new Error(id + ' 的 method 不合法')
    const safety = SAFETY.has(raw?.safety) ? raw.safety : 'careful'
    const label = String(raw?.label ?? id)
    const candidate = {
      id: categoryId + ':' + id,
      label,
      why: String(raw?.why ?? ''),
      bytes: Number(raw?.bytes) || 0,
      safety,
      method,
      origin: 'model',
    }
    if (method === 'command') {
      candidate.command = checkCommand(String(raw?.command ?? ''))
      candidate.paths = []
    } else {
      const paths = Array.isArray(raw?.paths) ? raw.paths : []
      if (paths.length === 0) throw new Error(id + ' 没有路径')
      candidate.paths = paths.map((path) => { checkPath(path); return String(path) })
    }
    candidate.reviewed = {
      verdict: 'proposed',
      by: 'model',
      at: new Date().toISOString(),
      key: reviewKey(candidate),
    }
    return candidate
  }

  const get = (path, run) => ({
    kind: 'exact',
    path: ROUTE_BASE + path,
    handler: (req, res) => {
      void (async () => {
        try {
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'loopback only' })
          if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
          writeJson(res, 200, { ok: true, ...(await run(req)) })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })()
    },
  })

  const post = (path, run) => ({
    kind: 'exact',
    path: ROUTE_BASE + path,
    handler: (req, res) => {
      void (async () => {
        try {
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'loopback only' })
          if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
          const body = await readJsonBody(req)
          writeJson(res, 200, { ok: true, ...(await run(body)) })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })()
    },
  })

  ctx.inject(['webServer'], (scope) => {
    const routes = [
      get('/chat/state', async () => {
        const agents = ctx.get('agents')
        if (!agents) return { messages: [], running: false, error: 'agents service missing' }
        const roots = agents.roots()
        const agent = roots.find((item) => item.status === 'running') ?? roots.slice().sort((a, b) => b.session.seq - a.session.seq)[0] ?? null
        if (!agent) return { messages: [], running: false }
        const messages = []
        for (const event of agent.session.snapshotEvents()) {
          if (event.type === 'user/message') {
            const content = event.data?.content ?? []
            const text = content.filter((block) => block.type === 'text').map((block) => block.text).join('')
            if (text !== '') messages.push({ id: 'u' + event.seq, role: 'user', text, at: event.time })
          } else if (event.type === 'assistant/message') {
            const content = event.data?.message?.content ?? []
            const blocks = []
            for (const block of content) {
              if (block.type === 'text' && block.text.trim() !== '') blocks.push({ type: 'text', text: block.text })
              else if (block.type === 'tool-call') blocks.push({ type: 'tool', name: block.name, detail: String(block.arguments ?? '').slice(0, 120) })
            }
            // Only turns the user actually reads become bubbles; tool-only steps stay out.
            if (blocks.some((block) => block.type === 'text')) messages.push({ id: 'a' + event.seq, role: 'assistant', blocks, at: event.time })
          }
        }
        return { messages: messages.slice(-40), running: agent.status === 'running', sessionId: agent.id }
      }),
      post('/chat/send', async (body) => {
        const text = String(body?.text ?? '').trim()
        if (text === '') throw new Error('消息是空的')
        const agents = ctx.get('agents')
        const roots = agents?.roots?.() ?? []
        const agent = roots.find((item) => item.status === 'running') ?? roots.slice().sort((a, b) => b.session.seq - a.session.seq)[0]
        if (!agent) throw new Error('没有可以投递的会话')
        agent.followup({ role: 'user', content: [{ type: 'text', text }] })
        return { sent: true, sessionId: agent.id }
      }),
      get('/state', async () => {
        await engine.load()
        return {
          snapshot: engine.snapshot,
          scanning: engine.scanning,
          canceled: engine.canceled === true,
          progress: engine.progress,
          error: engine.error,
          settings: await store.getSettings(),
          audit: await store.auditLog(60),
          rules: RULES.map((rule) => ({ id: rule.id, name: rule.name, family: rule.family })),
          tools: engine.toolCount ?? 0,
          toolError: engine.toolError ?? '',
        }
      }),
      get('/style', async () => ({})),
      post('/scan', async (body) => {
        if (engine.scanning) return { started: false, scanning: true }
        void engine.scan({ ruleIds: Array.isArray(body?.rules) ? body.rules : undefined }).catch(() => {})
        return { started: true }
      }),
      post('/cancel', async () => engine.cancel()),
      post('/plan', async (body) => {
        await engine.load()
        if (engine.snapshot === null) throw new Error('没有可清理的建议')
        const wanted = new Set((body?.ids ?? []).map(String))
        const selected = candidatesOf(engine.snapshot).filter((candidate) => wanted.has(candidate.id))
        if (selected.length === 0) throw new Error('没有选中任何建议')
        const settings = await store.getSettings()
        const plan = buildPlan(selected, settings)
        return { plan, script: renderScript(plan) }
      }),
      post('/clean', async (body) => {
        const result = await engine.clean(body?.ids, { by: 'panel' })
        return { freed: result.freed, results: result.results, plan: result.plan }
      }),
      post('/settings', async (body) => {
        const patch = {}
        if (typeof body?.allowDelete === 'boolean') patch.allowDelete = body.allowDelete
        if (Array.isArray(body?.disabledRules)) patch.disabledRules = body.disabledRules.map(String)
        if (typeof body?.concurrency === 'number') patch.concurrency = Math.max(1, Math.min(6, Math.round(body.concurrency)))
        return { settings: await store.setSettings(patch) }
      }),
      get('/audit', async () => ({ audit: await store.auditLog(200) })),
    ]
    // The stylesheet is a file, not a JSON payload: serve it before the JSON routes.
    const styleRoute = {
      kind: 'exact',
      path: ROUTE_BASE + '/style',
      handler: async (req, res) => {
        try {
          if (!isLoopback(req)) { res.writeHead(403); res.end(); return }
          const css = await readFile(STYLE_FILE, 'utf8')
          res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' })
          res.end(css)
        } catch {
          res.writeHead(404); res.end('no stylesheet')
        }
      },
    }
    const all = routes.filter((route) => route.path !== ROUTE_BASE + '/style').concat([styleRoute])
    scope.effect(() => {
      const disposers = all.map((route) => scope.webServer.register(route)).filter((dispose) => typeof dispose === 'function')
      return () => { for (const dispose of disposers) dispose() }
    }, 'dsh-disk-lens: routes')
  }, 'dsh-disk-lens: routes')

  ctx.inject(['tools'], (scope) => {
    try {
      scope.effect(() => {
        const defs = createTools({ engine })
        const disposers = defs.map((tool) => scope.tools.register(tool)).filter((dispose) => typeof dispose === 'function')
        engine.toolCount = defs.length
        return () => { for (const dispose of disposers) dispose() }
      }, 'dsh-disk-lens: tools')
    } catch (error) {
      engine.toolError = error instanceof Error ? error.message : String(error)
      warn('tool registration failed: ' + engine.toolError)
    }
  }, 'dsh-disk-lens: tools')

  void engine.load().catch(() => {})
  ctx.logger?.info?.('dsh-disk-lens: state at ' + dataDir)
}