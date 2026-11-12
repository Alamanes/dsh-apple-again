// The measuring engine. One job: turn the rule table into bytes the panel can
// draw. It shells out to du for each rule path, parses the stream as it
// arrives, and never walks the whole home folder on its own.

import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { expandPath, displayPath, reviewKey } from './guard.js'

const HOME = homedir()
const BIG_FILE_KB = 100 * 1024
const DIR_KB = 1
const MAX_BIG_FILES = 800
const PATH_TIMEOUT_MS = 240_000
const TOTAL_TIMEOUT_MS = 900_000
const REGENERABLE = new Set([
  'node_modules', 'target', '.venv', 'venv', 'Pods', 'DerivedData', '.gradle', '.next', '.nuxt',
  '.turbo', '__pycache__', 'CacheClip', 'ProxyMedia', 'Render Files', 'Transcoded Media',
  'Proxy Media', 'Media Cache', 'Media Cache Files', 'Peak Files', 'DerivedDataCache', '.godot',
])

const DENIED_RE = /(: Operation not permitted|: Permission denied)/

/**
 * What the Data volume actually holds. df's used column is the real number:
 * total minus "available" also swallows the space APFS calls reclaimable,
 * which the panel used to draw as if it were files.
 */
export async function diskSpace() {
  const df = await run('/bin/df', ['-k', '/System/Volumes/Data'])
  const lines = df.stdout.trim().split('\n')
  const cols = lines[lines.length - 1].trim().split(/\s+/)
  const total = Number(cols[1]) * 1024
  const used = Number(cols[2]) * 1024
  const available = Number(cols[3]) * 1024
  const smart = await jxaFree()
  const reclaimable = Math.max(0, (Number.isFinite(smart) ? smart : available) - available)
  return { total, used, available, reclaimable }
}

function jxaFree() {
  const script = 'ObjC.import("Foundation"); const out = Ref(); $.NSURL.fileURLWithPath("/").getResourceValueForKeyError(out, "NSURLVolumeAvailableCapacityForImportantUsageKey", Ref()); String(ObjC.unwrap(out[0]))'
  return run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], 8000)
    .then((result) => {
      const bytes = Number(result.stdout.trim())
      return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined
    })
    .catch(() => undefined)
}

function run(command, args, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(0, 200)))
      else resolve({ stdout, stderr })
    })
  })
}

/**
 * Measure one path with du, keeping only what the panel and the index need.
 * Resolves with bytes in 1024s, the big files found, and whether part of the
 * tree was denied by the kernel.
 */
export function measurePath(target, { signal, timeoutMs = PATH_TIMEOUT_MS, onLine } = {}) {
  const absolute = expandPath(target)
  return new Promise((resolve) => {
    let child
    let settled = false
    let buffer = ''
    let totalKb = 0
    let rootKb = 0
    let lastKb = 0
    let timedOut = false
    let denied = false
    let deniedCount = 0
    const bigFiles = []
    const regenerable = []

    const finish = (status) => {
      if (settled) return
      settled = true
      totalKb = rootKb || lastKb
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', abort)
      resolve({ path: absolute, display: displayPath(absolute), bytes: totalKb * 1024, status, bigFiles, regenerable, deniedCount })
    }
    const timer = setTimeout(() => { timedOut = true; child?.kill('SIGKILL'); finish('timeout') }, timeoutMs)
    const abort = () => { child?.kill('SIGKILL'); finish('cancel') }
    if (signal) {
      if (signal.aborted) return finish('cancel')
      signal.addEventListener('abort', abort, { once: true })
    }

    try {
      child = spawn('/usr/bin/du', ['-akx', absolute], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      return finish('failed')
    }

    const consume = (line) => {
      if (line === '') return
      const tab = line.indexOf('\t')
      if (tab <= 0) return
      const kb = Number(line.slice(0, tab))
      if (!Number.isFinite(kb)) return
      const path = line.slice(tab + 1)
      // du prints children first and the measured root last; the root line is
      // the only total, so never sum the rows.
      lastKb = kb
      if (path === absolute) rootKb = kb
      if (kb >= BIG_FILE_KB && bigFiles.length < MAX_BIG_FILES) bigFiles.push({ path, bytes: kb * 1024 })
      const name = path.slice(path.lastIndexOf('/') + 1)
      if (REGENERABLE.has(name) && kb >= DIR_KB) regenerable.push({ path, bytes: kb * 1024 })
      onLine?.(kb, path)
    }

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        consume(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
      }
    })
    let stderrText = ''
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderrText += text
      if (DENIED_RE.test(text)) { denied = true; deniedCount += 1 }
    })
    child.on('error', () => finish('failed'))
    child.on('close', (code) => {
      if (buffer !== '') consume(buffer.replace(/\n$/, ''))
      if (timedOut) return finish('timeout')
      const size = rootKb || lastKb
      if (code !== 0 && size === 0) {
        if (/No such file or directory/.test(stderrText)) return finish('missing')
        return finish(denied ? 'denied' : 'failed')
      }
      // A few unreadable children inside a large tree do not make the whole
      // measurement useless: the size is still the real size.
      finish(size > 0 ? 'ok' : denied ? 'denied' : 'failed')
    })
  })
}

/**
 * Run the whole rule table.
 * @param options.rules - the rules to measure.
 * @param options.signal - AbortSignal for cancel.
 * @param options.concurrency - parallel du processes.
 * @param options.onProgress - called after each path with {path, done, total}.
 */
export async function scanDisk({ rules, concurrency = 4, signal, onProgress } = {}) {
  const startedAt = Date.now()
  const measureStarted = Date.now()
  const warnings = []
  const measured = new Map()
  const results = new Map()
  const index = { bigFiles: [], dirs: [], regenerable: [] }
  const denied = []
  let deniedCount = 0

  const targets = []
  for (const rule of rules) for (const item of rule.items) targets.push({ ruleId: rule.id, item })
  const total = targets.length
  let done = 0

  const disk = await diskSpace().catch(() => ({ total: 0, used: 0, available: 0, reclaimable: 0 }))

  const queue = targets.slice()
  const workers = Array.from({ length: Math.max(1, Math.min(6, concurrency)) }, async () => {
    for (;;) {
      const next = queue.shift()
      if (next === undefined) return
      if (signal?.aborted) return
      const remaining = TOTAL_TIMEOUT_MS - (Date.now() - measureStarted)
      if (remaining <= 0) { warnings.push('总时长超过 15 分钟，后面的路径没有测量'); return }
      const result = await measurePath(next.item.path, {
        signal,
        timeoutMs: Math.min(PATH_TIMEOUT_MS, remaining),
      })
      results.set(next.item.path, result)
      measured.set(next.item.path, result.bytes)
      if (result.status === 'denied') denied.push(result.display)
      deniedCount += result.deniedCount ?? 0
      if (result.status !== 'ok' && result.status !== 'denied' && result.status !== 'missing') {
        warnings.push(result.display + '：' + result.status)
      }
      for (const file of result.bigFiles) index.bigFiles.push(file)
      for (const dir of result.regenerable) index.regenerable.push(dir)
      if (result.status === 'ok') index.dirs.push({ path: result.display, bytes: result.bytes })
      done += 1
      onProgress?.({ path: result.display, bytes: result.bytes, status: result.status, done, total })
      if (signal?.aborted) return
    }
  })
  await Promise.all(workers)

  index.bigFiles.sort((a, b) => b.bytes - a.bytes)
  index.bigFiles = index.bigFiles.slice(0, MAX_BIG_FILES)
  index.regenerable.sort((a, b) => b.bytes - a.bytes)
  index.regenerable = dedupeTree(index.regenerable).slice(0, 200)

  const categories = []
  let accounted = 0
  for (const rule of rules) {
    if (signal?.aborted) break
    const items = []
    let bytes = 0
    for (const item of rule.items) {
      const result = results.get(item.path)
      const size = result?.bytes ?? 0
      items.push({ label: item.label, path: item.path, bytes: size, status: result?.status ?? 'missing' })
      bytes += size
    }
    items.sort((a, b) => b.bytes - a.bytes)
    accounted += bytes
    const cleanup = typeof rule.cleanup === 'function' && !rule.readOnly ? safeCleanup(rule, measured) : []
    categories.push({
      id: rule.id,
      family: rule.family,
      name: rule.name,
      note: rule.note ?? '',
      readOnly: rule.readOnly === true,
      bytes,
      items,
      cleanup,
    })
  }

  const used = Math.max(0, disk.used ?? (disk.total - (disk.available ?? 0)))
  const unaccounted = Math.max(0, used - accounted)
  if (unaccounted > 0) {
    categories.push({
      id: 'unaccounted',
      family: 'system',
      name: '量不到',
      note: deniedCount > 0
        ? '系统拒绝了 ' + deniedCount + ' 个目录的读取权限，那部分体积落在这里。'
        : '规则表没覆盖到的目录。',
      readOnly: true,
      bytes: unaccounted,
      items: [],
      cleanup: [],
    })
  }

  return {
    id: 'disk-' + Date.now(),
    createdAt: new Date().toISOString(),
    source: 'rule',
    disk: {
      total: disk.total,
      used,
      available: disk.available ?? Math.max(0, disk.total - used),
      reclaimable: disk.reclaimable ?? 0,
    },
    categories,
    accounted,
    unaccounted,
    index,
    denied,
    deniedCount,
    warnings,
    durationMs: Date.now() - startedAt,
  }
}

function safeCleanup(rule, measured) {
  try {
    const list = rule.cleanup(measured) ?? []
    return list.map((candidate) => ({
      origin: 'rule',
      reviewed: {
        verdict: 'approved',
        by: 'rule',
        at: new Date().toISOString(),
        key: reviewKey(candidate),
      },
      ...candidate,
    }))
  } catch {
    return []
  }
}

function dedupeTree(list) {
  const paths = new Set(list.map((entry) => entry.path))
  return list.filter((entry) => {
    let parent = entry.path
    for (;;) {
      const slash = parent.lastIndexOf('/')
      if (slash <= 0) return true
      parent = parent.slice(0, slash)
      if (paths.has(parent)) return false
    }
  })
}
