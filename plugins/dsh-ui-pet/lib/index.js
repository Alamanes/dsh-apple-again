/**
 * dsh-ui-copy host half — pet.
 *
 * A pet pack is the Codex format: one directory holding `pet.json` and a
 * spritesheet. Two roots are scanned, in this order:
 *
 *   ~/.dsh/pets    the DSH-owned root; a pack here wins outright
 *   ~/.codex/pets  the fallback, read only while the first root yields no pack
 *
 * A root "yields no pack" when it is absent, unreadable, or holds no directory
 * with a parsed `pet.json` and a readable spritesheet. The fallback is per
 * root, not per pack, so a stray directory in ~/.dsh/pets can never mix half of
 * one library into the other.
 *
 * The browser half receives the catalog as a global injection on every index
 * render, then fetches `list` when it needs a live rescan. Sheets are served
 * one pack at a time, keyed by the scanned directory name, so no path outside
 * the catalog is addressable.
 *
 * Routes:
 *   GET /dsh-ui-copy/pet/list          → { source, pets[] }
 *   GET /dsh-ui-copy/pet/asset/<dir>   → the pack's spritesheet bytes
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'

export const name = 'ui-pet'

export const Config = Schema.object({})

/** Package root, for the bundled token sheet. */
const LIB = fileURLToPath(new URL('./', import.meta.url))

/** Suite route base; the browser half hard-codes the same spelling. */
const ROUTE_BASE = '/dsh-ui-copy/pet/'

/** Spritesheet extensions a pack may use, and the type each one is served as. */
const SPRITE_MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.gif': 'image/gif',
}

/** Fallback sheet names tried when `pet.json` does not name one. */
const SPRITE_NAMES = ['spritesheet.webp', 'spritesheet.png', 'pet.webp', 'pet.png', 'atlas.webp', 'atlas.png']

/** Expand a leading `~/` so a configured root matches what a shell would read. */
function expandHome(value) {
  return value.startsWith('~/') ? join(homedir(), value.slice(2)) : value
}

/** One pack's manifest, normalized across the Codex v1 and v2 spellings. */
function readManifest(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const file = names.find((entry) => entry.toLowerCase() === 'pet.json')
  if (file === undefined) return null

  let raw = null
  try {
    raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const version = raw.spriteVersionNumber === 2 ? 2 : 1
  const fallback = basename(dir)
  const name = typeof raw.displayName === 'string' && raw.displayName !== ''
    ? raw.displayName
    : typeof raw.name === 'string' && raw.name !== ''
      ? raw.name
      : fallback

  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : fallback,
    name,
    version,
    columns: Number.isInteger(raw.columns) && raw.columns > 0 ? raw.columns : 8,
    rows: Number.isInteger(raw.rows) && raw.rows > 0 ? raw.rows : version === 2 ? 11 : 9,
    spritesheetPath: typeof raw.spritesheetPath === 'string' ? raw.spritesheetPath : '',
  }
}

/**
 * The pack's spritesheet, or null when the manifest names nothing readable.
 *
 * A relative name is honoured; an absolute path and a name that walks out of
 * the pack directory are both refused, so a manifest cannot address a file
 * outside its own folder.
 */
function spriteOf(dir, listed) {
  const candidates = []
  if (listed !== '') candidates.push(listed.replace(/^\.\//, ''))
  for (const name of SPRITE_NAMES) candidates.push(name)

  for (const name of candidates) {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) continue
    const type = SPRITE_MIME[extname(name).toLowerCase()]
    if (type === undefined) continue
    const file = join(dir, name)
    try {
      const info = statSync(file)
      if (!info.isFile() || info.size === 0) continue
    } catch {
      continue
    }
    return { file, type }
  }
  return null
}

/** Every readable pack directly under one root, sorted by display name. */
function listPacks(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }

  const packs = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(root, entry.name)
    const manifest = readManifest(dir)
    if (manifest === null) continue
    const sprite = spriteOf(dir, manifest.spritesheetPath)
    if (sprite === null) continue
    packs.push({
      id: manifest.id,
      name: manifest.name,
      dir: entry.name,
      version: manifest.version,
      columns: manifest.columns,
      rows: manifest.rows,
      file: sprite.file,
      type: sprite.type,
    })
  }

  return packs.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Resolve the preferred root.
 *
 * The first root with at least one pack owns the catalog outright; the second
 * is tried only when the first is empty. With both empty the preferred root is
 * still reported, so the browser can say which folder to fill.
 */
function resolveCatalog(config) {
  const home = homedir()
  const dshRoot = typeof config.dshRoot === 'string' && config.dshRoot !== ''
    ? expandHome(config.dshRoot)
    : join(home, '.dsh', 'pets')
  const codexRoot = typeof config.codexRoot === 'string' && config.codexRoot !== ''
    ? expandHome(config.codexRoot)
    : join(home, '.codex', 'pets')

  const roots = config.prefer === 'codex'
    ? [{ source: 'codex', root: codexRoot }, { source: 'dsh', root: dshRoot }]
    : [{ source: 'dsh', root: dshRoot }, { source: 'codex', root: codexRoot }]

  for (const candidate of roots) {
    const pets = listPacks(candidate.root)
    if (pets.length > 0) return { source: candidate.source, root: candidate.root, pets }
  }
  return { source: roots[0].source, root: roots[0].root, pets: [] }
}

/** Strip the host-only fields; the browser only ever sees route-shaped data. */
function publicCatalog(catalog) {
  return {
    source: catalog.source,
    pets: catalog.pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      dir: pet.dir,
      version: pet.version,
      columns: pet.columns,
      rows: pet.rows,
      asset: ROUTE_BASE + 'asset/' + encodeURIComponent(pet.dir),
    })),
  }
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendAsset(config, key, res) {
  const catalog = resolveCatalog(config)
  const pet = catalog.pets.find((candidate) => candidate.dir === key || candidate.id === key)
  if (pet === undefined) {
    sendJson(res, 404, { error: 'unknown-pet' })
    return
  }

  let body
  try {
    body = readFileSync(pet.file)
  } catch {
    sendJson(res, 404, { error: 'unreadable-sheet' })
    return
  }

  res.writeHead(200, {
    'content-type': pet.type,
    'content-length': String(body.length),
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/* ---- live agent status ------------------------------------------------- */

/** Session id -> last reported agent status, so several agents can be tracked. */
const agentStatus = new Map()

/** Whether any agent on this host is currently running. */
function anyAgentRunning() {
  for (const status of agentStatus.values()) {
    if (status === 'running') return true
  }
  return false
}

/**
 * The browser's status channel: one SSE stream per page, pushed on every
 * `agent/status` change. This is the signal the pet needs for "the model is
 * working right now" — the DOM only reflects it a step later, and sometimes
 * never while the row is reused.
 */
function createStateHub() {
  const clients = new Set()

  const frame = () => 'data: ' + JSON.stringify({ running: anyAgentRunning() }) + '\n\n'

  const broadcast = () => {
    const body = frame()
    for (const res of clients) {
      try {
        res.write(body)
      } catch {
        clients.delete(res)
      }
    }
  }

  return {
    track(payload) {
      if (payload === null || typeof payload !== 'object') return
      const agent = payload.agent
      const key = agent !== null && typeof agent === 'object'
        ? String(agent.id ?? agent.sessionId ?? 'agent')
        : 'agent'
      agentStatus.set(key, payload.status)
      broadcast()
    },
    forget(payload) {
      const agent = payload !== null && typeof payload === 'object' ? payload.agent : null
      if (agent === null || typeof agent !== 'object') return
      const key = String(agent.id ?? agent.sessionId ?? 'agent')
      agentStatus.delete(key)
      broadcast()
    },
    ping() {
      broadcast()
    },
    handler(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      })
      res.write(frame())
      clients.add(res)
      const close = () => { clients.delete(res) }
      req.on('close', close)
      res.on('close', close)
    },
  }
}

/** One handler for the whole prefix: `list`, `state` and `asset/<dir>`. */
function route(config, hub, req, res) {
  let pathname = '/'
  try {
    pathname = new URL(String(req.url ?? '/'), 'http://dsh.local').pathname
  } catch {
    sendJson(res, 400, { error: 'bad-url' })
    return
  }
  if (!pathname.startsWith(ROUTE_BASE)) {
    sendJson(res, 404, { error: 'not-found' })
    return
  }

  if (pathname === ROUTE_BASE + 'list') {
    sendJson(res, 200, publicCatalog(resolveCatalog(config)))
    return
  }

  if (pathname === ROUTE_BASE + 'state') {
    sendJson(res, 200, { running: anyAgentRunning() })
    return
  }

  if (pathname === ROUTE_BASE + 'state/stream') {
    hub.handler(req, res)
    return
  }

  const assetPrefix = ROUTE_BASE + 'asset/'
  if (pathname.startsWith(assetPrefix)) {
    let key = ''
    try {
      key = decodeURIComponent(pathname.slice(assetPrefix.length))
    } catch {
      sendJson(res, 400, { error: 'bad-asset-key' })
      return
    }
    sendAsset(config, key, res)
    return
  }

  sendJson(res, 404, { error: 'not-found' })
}

/** The token layer, so the package works installed on its own. */
function readTokens() {
  try {
    return readFileSync(LIB + 'styles/tokens.css', 'utf8')
  } catch {
    return null
  }
}

/**
 * Hand the catalog and this package's configuration to the browser half.
 *
 * A boot-graph row arrives as `{ id, url, rev }` and `apply(ctx, config)` sees
 * an empty config, so the row's settings travel through the page: a `global`
 * row carries them as `window.DSHUI_PET`, which is also the block the suite
 * runtime hands the component as `rt.config`.
 */
function injectCatalog(ctx, config) {
  ctx.on('webserver/index-inject', (table) => {
    let catalog = { source: 'dsh', pets: [] }
    try {
      catalog = publicCatalog(resolveCatalog(config))
    } catch (error) {
      if (typeof ctx.logger?.warn === 'function') {
        ctx.logger.warn('dsh-ui-pet: could not scan the pet roots — ' + String((error && error.message) || error))
      }
    }
    table.push({ kind: 'global', name: 'DSHUI_PET', value: { ...config, catalog } })
    const tokens = readTokens()
    if (tokens !== null) table.push({ kind: 'style', text: tokens })
  })
}

/** Cordis entry. */
export function apply(ctx, config) {
  const value = config !== null && typeof config === 'object' ? config : {}
  const hub = createStateHub()
  injectCatalog(ctx, value)

  ctx.on('agent/status', (payload) => hub.track(payload))
  ctx.on('agent/disposed', (payload) => hub.forget(payload))

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/dsh-ui-copy/pet',
      handler: (req, res) => route(value, hub, req, res),
    }), 'ui-pet: routes')

    // A frame every two seconds keeps the stream warm and lets the browser tell
    // a silent-but-open stream from a dead one.
    scope.effect(() => {
      const timer = setInterval(() => hub.ping(), 2000)
      return () => clearInterval(timer)
    }, 'ui-pet: heartbeat')
  })
}
