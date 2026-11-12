// Panel state on disk: one snapshot, one settings file, an append-only audit
// log. Everything is plain JSON so the user can read it with any editor.

import { mkdir, readFile, rename, writeFile, appendFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const DEFAULT_SETTINGS = {
  allowDelete: false,
  disabledRules: [],
  customPaths: [],
  concurrency: 4,
}

function atomicWrite(file, text) {
  const tmp = file + '.' + process.pid + '.' + Date.now().toString(36) + '.tmp'
  return mkdir(dirname(file), { recursive: true })
    .then(() => writeFile(tmp, text, 'utf8'))
    .then(() => rename(tmp, file))
}

async function readJson(file, fallback) {
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function createStore({ root }) {
  const snapshotFile = join(root, 'snapshot.json')
  const settingsFile = join(root, 'settings.json')
  const auditFile = join(root, 'audit.jsonl')
  const planFile = join(root, 'plan.json')

  let snapshot = null
  let settings = { ...DEFAULT_SETTINGS }
  let audit = []
  let ready = null

  function load() {
    if (ready !== null) return ready
    ready = (async () => {
      await mkdir(root, { recursive: true })
      snapshot = await readJson(snapshotFile, null)
      settings = { ...DEFAULT_SETTINGS, ...(await readJson(settingsFile, {})) }
      try {
        const text = await readFile(auditFile, 'utf8')
        audit = text.split('\n').filter(Boolean).slice(-400).map((line) => {
          try { return JSON.parse(line) } catch { return null }
        }).filter(Boolean)
      } catch { audit = [] }
    })()
    return ready
  }

  return {
    root,
    files: { snapshotFile, settingsFile, auditFile, planFile },
    async getSnapshot() { await load(); return snapshot },
    async setSnapshot(next) {
      await load()
      snapshot = next
      if (next === null) return
      await atomicWrite(snapshotFile, JSON.stringify(next))
    },
    async getSettings() { await load(); return { ...settings } },
    async setSettings(patch) {
      await load()
      settings = { ...settings, ...patch }
      if (!Array.isArray(settings.disabledRules)) settings.disabledRules = []
      await atomicWrite(settingsFile, JSON.stringify(settings, null, 2))
      return { ...settings }
    },
    async audit(entry) {
      await load()
      const row = { at: new Date().toISOString(), ...entry }
      audit.push(row)
      if (audit.length > 400) audit = audit.slice(-400)
      await appendFile(auditFile, JSON.stringify(row) + '\n', 'utf8')
      return row
    },
    async auditLog(limit = 120) {
      await load()
      return audit.slice(-limit).reverse()
    },
    async setPlan(plan) { await atomicWrite(planFile, JSON.stringify(plan, null, 2)) },
    async getPlan() { return readJson(planFile, null) },
    async sizeOnDisk() {
      try { return (await stat(snapshotFile)).size } catch { return 0 }
    },
  }
}
