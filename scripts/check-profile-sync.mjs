#!/usr/bin/env node
/**
 * Verify that every package the profile installs from a local path still
 * matches its source tree.
 *
 * pnpm materializes `file:` and `link:` dependencies as materialized copies
 * inside the profile's node_modules. An editor that saves atomically (write a
 * temp file, then rename) replaces the file instead of writing through the
 * hard link, so a source edit can silently stop reaching the running host.
 * Run this before restarting the host to prove that what it will load is what
 * was just changed.
 *
 * Usage:
 *   node scripts/check-profile-sync.mjs                 # default desktop profile
 *   node scripts/check-profile-sync.mjs --profile <dir>
 *   node scripts/check-profile-sync.mjs --only dsh-ui-ptc
 *
 * Exit code: 0 when every local package matches, 1 when any differs, 2 on a
 * usage or read error.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

const IGNORED_NAMES = new Set(['.git', 'node_modules', '.DS_Store'])
const IGNORED_SUFFIXES = ['.log']

function fail(message) {
  process.stderr.write(`check-profile-sync: ${message}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = { profile: join(homedir(), '.dsh', 'profiles', 'desktop'), only: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') {
      options.profile = argv[index + 1] ?? fail('--profile needs a directory')
      index += 1
      continue
    }
    if (arg === '--only') {
      options.only = argv[index + 1] ?? fail('--only needs a package name')
      index += 1
      continue
    }
    fail(`unknown argument: ${arg}`)
  }
  return options
}

/** Collect relative paths of every file worth comparing. */
async function collect(root, base = root, out = new Map()) {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue
    if (IGNORED_SUFFIXES.some(suffix => entry.name.endsWith(suffix))) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await collect(path, base, out)
      continue
    }
    if (!entry.isFile()) continue
    const info = await stat(path)
    out.set(relative(base, path), info.size)
  }
  return out
}

/** Local path specs of the profile, resolved against the profile directory. */
async function localDependencies(profile) {
  const manifestPath = join(profile, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    fail(`cannot read ${manifestPath}: ${error.message}`)
  }
  const found = []
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    const match = /^(?:file|link):(.+)$/.exec(spec)
    if (match === null) continue
    found.push({ name, source: resolve(profile, match[1]) })
  }
  return found
}

/**
 * The `files` array of the source manifest. pnpm installs only what that array
 * allows, so a source file outside it (src, or a patch for a package that rides
 * the suite) is expected to be absent from the profile copy.
 */
async function installFilter(source) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  } catch {
    return () => true
  }
  const files = Array.isArray(manifest.files) ? manifest.files : null
  if (files === null) return () => true
  const patterns = files.map(pattern => {
    const clean = pattern.replace(/^\.\//, '')
    if (!clean.includes('*')) return { exact: clean }
    const source = clean
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
    return { regex: new RegExp(`^${source}$`) }
  })
  return relativePath => patterns.some(pattern => {
    if (pattern.exact !== undefined) {
      return relativePath === pattern.exact || relativePath.startsWith(`${pattern.exact}/`)
    }
    return pattern.regex.test(relativePath)
  })
}

/** Compare one installed copy against its source tree. */
async function compare(entry, profile) {
  const target = join(profile, 'node_modules', ...entry.name.split('/'))
  let targetStat
  try {
    targetStat = await stat(target)
  } catch {
    return { state: 'missing', name: entry.name, problems: [`not installed at ${target}`] }
  }
  if (!targetStat.isDirectory()) {
    return { state: 'missing', name: entry.name, problems: [`${target} is not a directory`] }
  }

  const installed = await installFilter(entry.source)
  const sourceAll = await collect(entry.source)
  const targetAll = await collect(target)
  const sourceFiles = new Map([...sourceAll].filter(([path]) => installed(path)))
  const targetFiles = new Map([...targetAll].filter(([path]) => installed(path)))
  const problems = []
  for (const [path] of sourceFiles) {
    const installedSize = targetFiles.get(path)
    if (installedSize === undefined) {
      problems.push(`only in source: ${path}`)
      continue
    }
    const [sourceBytes, targetBytes] = await Promise.all([
      readFile(join(entry.source, path)),
      readFile(join(target, path)),
    ])
    if (!sourceBytes.equals(targetBytes)) problems.push(`differs: ${path}`)
  }
  for (const [path] of targetFiles) {
    if (!sourceFiles.has(path)) problems.push(`only in profile: ${path}`)
  }
  return { state: problems.length === 0 ? 'ok' : 'drift', name: entry.name, problems }
}

const options = parseArgs(process.argv.slice(2))
const dependencies = await localDependencies(options.profile)
const selected = options.only === null
  ? dependencies
  : dependencies.filter(entry => entry.name === options.only)

if (selected.length === 0) {
  process.stdout.write(`check-profile-sync: no local dependency named ${options.only}\n`)
  process.exit(2)
}

const results = []
for (const entry of selected) {
  results.push(await compare(entry, options.profile))
}

let drift = 0
for (const result of results) {
  if (result.state === 'ok') {
    process.stdout.write(`ok    ${result.name}\n`)
    continue
  }
  drift += 1
  process.stdout.write(`drift ${result.name}\n`)
  for (const problem of result.problems.slice(0, 12)) {
    process.stdout.write(`      ${problem}\n`)
  }
  if (result.problems.length > 12) {
    process.stdout.write(`      ... ${result.problems.length - 12} more\n`)
  }
}

process.stdout.write(
  drift === 0
    ? `\nall ${results.length} local packages match their sources\n`
    : `\n${drift} of ${results.length} local packages differ — run \`pnpm install\` in ${options.profile} (or copy the files) before restarting the host\n`,
)
process.exit(drift === 0 ? 0 : 1)
