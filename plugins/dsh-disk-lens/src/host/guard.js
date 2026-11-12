// Path and command fences. The rule table is data, but a model may hand us
// paths and commands too, so every candidate passes through here before the
// panel even shows it — and again right before it runs.

import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'

export const HOME = homedir()

/** Whole directories that may never be removed as one step. */
export const PROTECTED_WHOLE = new Set([
  '/', '/System', '/Library', '/Applications', '/Users', '/private', '/usr', '/bin', '/sbin',
  '/opt', '/opt/homebrew', '/Volumes',
  HOME, HOME + '/Library', HOME + '/Documents', HOME + '/Desktop', HOME + '/Downloads',
  HOME + '/Pictures', HOME + '/Music', HOME + '/Movies', HOME + '/Projects',
  HOME + '/Library/Application Support', HOME + '/Library/Containers',
  HOME + '/Library/Group Containers', HOME + '/Library/Mobile Documents',
  HOME + '/Library/CloudStorage',
])

/** Sub-trees that are never touched, at any depth. */
export const PROTECTED_SUBTREE = [
  '/System', '/usr', '/bin', '/sbin',
  HOME + '/.ssh', HOME + '/.gnupg', HOME + '/Library/Keychains',
  HOME + '/Library/Mobile Documents', HOME + '/Library/Mail', HOME + '/Library/Messages',
]

/** Outside the home folder only these may be cleaned. */
const OUTSIDE_ALLOWED = ['/Applications/', '/Library/Caches/']

const COMMAND_RULES = [
  /\bsudo\b/,
  /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~\/?)(\s|$|;|&)/,
  /\bmkfs\b/,
  /\bdiskutil\s+(erase|partition)/,
  /:\(\)\s*\{/,
  /\bdd\s+if=/,
  />\s*\/dev\/(disk|rdisk)/,
  /\brm\s+-rf\s+\/(\s|$)/,
]

/** Expand a leading ~ and normalize without touching the disk. */
export function expandPath(input) {
  const raw = String(input ?? '').trim()
  if (raw === '') throw new Error('路径为空')
  const absolute = raw.startsWith('~') ? HOME + raw.slice(1) : raw
  if (!absolute.startsWith('/')) throw new Error('必须是绝对路径或 ~ 开头：' + raw)
  return posix.normalize(absolute).replace(/\/+$/, '') || '/'
}

/** Display form: home folded back to ~. */
export function displayPath(absolute) {
  const path = expandPath(absolute)
  return path === HOME ? '~' : path.startsWith(HOME + '/') ? '~' + path.slice(HOME.length) : path
}

/** Throw when this path may not be removed. Returns the normalized path. */
export function checkPath(input) {
  const path = expandPath(input)
  if (path.split('/').includes('..')) throw new Error('路径不能包含 ..：' + input)
  if (PROTECTED_WHOLE.has(path)) throw new Error('受保护的目录，不能整目录删除：' + displayPath(path))
  for (const guard of PROTECTED_SUBTREE) {
    if (path === guard || path.startsWith(guard + '/')) throw new Error('受保护的位置：' + displayPath(path))
  }
  if (/\.photoslibrary(\/|$)/.test(path)) throw new Error('照片图库只能在「照片」里管理：' + displayPath(path))
  const insideHome = path === HOME || path.startsWith(HOME + '/')
  const allowedOutside = OUTSIDE_ALLOWED.some((prefix) => path.startsWith(prefix))
  if (!insideHome && !allowedOutside) throw new Error('家目录之外只允许清理 /Applications 与 /Library/Caches：' + path)
  return path
}

/** Throw when a shell command matches a dangerous shape. */
export function checkCommand(command) {
  const text = String(command ?? '')
  if (text.trim() === '') throw new Error('命令为空')
  for (const rule of COMMAND_RULES) {
    if (rule.test(text)) throw new Error('命令被拒绝（' + rule.source + '）：' + text)
  }
  return text
}

/** Stable digest of what a candidate actually does; a review must match it. */
export function reviewKey(candidate) {
  const shape = [candidate.method, (candidate.paths ?? []).map(expandPath), candidate.command ?? '']
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16)
}

/** A candidate may run only after its review matches the current shape. */
export function assertReviewed(candidate) {
  if (!candidate?.reviewed) throw new Error('「' + candidate.label + '」还没有经过复核，不能清理')
  if (candidate.reviewed.key !== reviewKey(candidate)) throw new Error('「' + candidate.label + '」在复核之后被改动过，不能清理')
  return candidate
}
