// Turning approval into bytes freed. A candidate reaches this file only after
// the panel's user ticked it, and each one is checked again right before it runs.

import { spawn } from 'node:child_process'
import { mkdir, rename, stat, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { checkCommand, checkPath, expandPath, displayPath, assertReviewed, reviewKey } from './guard.js'

const HOME = homedir()
const TRASH = join(HOME, '.Trash')

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Move one path into ~/.Trash, renaming on collision. */
async function moveToTrash(path) {
  await mkdir(TRASH, { recursive: true })
  let target = join(TRASH, basename(path))
  try {
    await stat(target)
    target = target + ' ' + stamp()
  } catch { /* free name */ }
  try {
    await rename(path, target)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    const result = await zsh("osascript -e 'tell application \"Finder\" to delete (POSIX file " + JSON.stringify(path) + ")'")
    if (result.code !== 0) throw new Error('移到废纸篓失败：' + displayPath(path))
  }
}

function zsh(command, { signal, timeoutMs = 1_800_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME } })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8') })
    const abort = () => child.kill('SIGKILL')
    signal?.addEventListener('abort', abort, { once: true })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve({ code: code ?? 1, output })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: 1, output: String(error?.message ?? error) })
    })
  })
}

/** Validate one candidate again and return a runnable step. */
export function toStep(candidate, { allowDelete = false } = {}) {
  assertReviewed(candidate)
  if (candidate.method === 'command') {
    checkCommand(candidate.command)
    return { ...candidate, method: 'command', command: candidate.command, paths: [] }
  }
  if (candidate.method === 'delete' && !allowDelete) {
    throw new Error('「' + candidate.label + '」是直接删除，设置里没有打开删除开关')
  }
  if (!Array.isArray(candidate.paths) || candidate.paths.length === 0) throw new Error('「' + candidate.label + '」没有路径')
  const paths = candidate.paths.map(checkPath)
  return { ...candidate, paths }
}

/** Build the plan the panel shows before anything runs. */
export function buildPlan(candidates, settings = {}) {
  const steps = candidates.map((candidate) => toStep(candidate, settings))
  return { id: 'plan-' + Date.now(), createdAt: new Date().toISOString(), steps }
}

/** Render the plan as a zsh script the user can read or run themselves. */
export function renderScript(plan) {
  const lines = ['#!/bin/zsh', '# dsh-disk-lens plan · ' + plan.createdAt, '# ' + plan.steps.length + ' steps, about ' + formatBytes(plan.steps.reduce((sum, step) => sum + (step.bytes ?? 0), 0)) + ' to free', 'set -u', '']
  const quote = (path) => {
    const display = displayPath(path)
    return display === '~' ? '~' : display.startsWith('~/') ? '~/' + "'" + display.slice(2).replace(/'/g, "'\\''") + "'" : "'" + display.replace(/'/g, "'\\''") + "'"
  }
  plan.steps.forEach((step, index) => {
    lines.push('# ' + (index + 1) + '. ' + step.label + ' (about ' + formatBytes(step.bytes ?? 0) + ')')
    if (step.why) lines.push('#    ' + step.why)
    if (step.method === 'trash') for (const path of step.paths) lines.push('mv ' + quote(path) + ' ~/.Trash/')
    if (step.method === 'delete') for (const path of step.paths) lines.push('rm -rf ' + quote(path))
    if (step.method === 'command') lines.push(step.command)
    lines.push('')
  })
  return lines.join('\n')
}

/** Run every step, reporting each state transition. */
export async function executePlan(plan, { signal, settings = {}, onProgress } = {}) {
  let freed = 0
  const results = []
  for (const step of plan.steps) {
    if (signal?.aborted) {
      const skipped = { stepId: step.id, label: step.label, state: 'skipped', message: '已取消' }
      results.push(skipped)
      onProgress?.(skipped)
      continue
    }
    onProgress?.({ stepId: step.id, label: step.label, state: 'running' })
    const before = await freeBytes()
    try {
      if (step.method === 'trash') {
        for (const path of step.paths) await moveToTrash(path)
      } else if (step.method === 'delete') {
        for (const path of step.paths) await rm(path, { recursive: true, force: true })
      } else {
        const result = await zsh(step.command, { signal })
        if (result.code !== 0) throw new Error('命令退出码 ' + result.code + '：' + result.output.slice(-400))
      }
      const after = await freeBytes()
      const gained = step.method === 'trash' ? 0 : Math.max(0, after - before)
      freed += gained
      const done = { stepId: step.id, label: step.label, state: 'done', freedBytes: gained, message: step.method === 'trash' ? '已移到废纸篓' : undefined }
      results.push(done)
      onProgress?.(done)
    } catch (error) {
      const failed = { stepId: step.id, label: step.label, state: 'failed', message: error instanceof Error ? error.message : String(error) }
      results.push(failed)
      onProgress?.(failed)
    }
  }
  return { freed, results }
}

async function freeBytes() {
  const { diskSpace } = await import('./scan.js')
  const disk = await diskSpace().catch(() => null)
  return disk?.free ?? 0
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e11 ? 0 : 1) + ' G'
  return Math.max(0, value / 1e6).toFixed(0) + ' M'
}

export { reviewKey, expandPath }
