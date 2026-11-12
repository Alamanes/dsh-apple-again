// The tools the model uses when the user asks for an analysis in the chat.
// The panel works without them; they only add the second opinion.

import { formatBytes } from './clean.js'

function summarize(snapshot, limit = 12) {
  if (snapshot === null) return '还没有扫描结果。先调用 disk_scan。'
  const used = snapshot.disk?.used ?? 0
  const free = snapshot.disk?.free ?? 0
  const lines = [
    '磁盘：总 ' + formatBytes((snapshot.disk?.total ?? 0)) + '，已用 ' + formatBytes(used) + '，可用 ' + formatBytes(free) + '。',
    '扫描于 ' + String(snapshot.createdAt ?? '').slice(0, 16).replace('T', ' ') + '，耗时 ' + Math.round((snapshot.durationMs ?? 0) / 1000) + ' 秒。',
    '',
    '分类（按大小）：',
  ]
  const categories = [...(snapshot.categories ?? [])].sort((a, b) => b.bytes - a.bytes).slice(0, limit)
  for (const category of categories) {
    lines.push('- ' + category.name + '（' + category.family + '）：' + formatBytes(category.bytes) + '，' + (category.items?.length ?? 0) + ' 项')
    for (const item of (category.items ?? []).slice(0, 4)) {
      lines.push('    ' + item.label + ' ' + formatBytes(item.bytes) + '  ' + item.path + '  [' + item.status + ']')
    }
  }
  if (snapshot.unaccounted > 0) lines.push('- 尚未归类：' + formatBytes(snapshot.unaccounted))
  const big = (snapshot.index?.bigFiles ?? []).slice(0, 8)
  if (big.length > 0) {
    lines.push('', '大文件（前 8）：')
    for (const file of big) lines.push('  ' + formatBytes(file.bytes) + '  ' + file.path)
  }
  if ((snapshot.denied ?? []).length > 0) lines.push('', '没有权限读取：' + snapshot.denied.slice(0, 6).join('、'))
  const candidates = candidatesOf(snapshot)
  if (candidates.length > 0) {
    lines.push('', '已有清理建议（' + candidates.length + ' 条）：')
    for (const candidate of candidates.slice(0, 14)) {
      lines.push('  ' + candidate.id + '  ' + candidate.label + '  ' + formatBytes(candidate.bytes) + '  ' + candidate.method + '/' + candidate.safety)
    }
  }
  return lines.join('\n')
}

export function candidatesOf(snapshot) {
  const out = []
  for (const category of snapshot?.categories ?? []) {
    for (const candidate of category.cleanup ?? []) out.push({ ...candidate, category: category.name })
  }
  return out
}

export function createTools({ engine }) {
  const scan = {
    name: 'disk_scan',
    description: 'Measure the disk with the rule table and return the summary. Takes one to three minutes. Optional rules limits the walk to those rule ids.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rules: { type: 'array', items: { type: 'string' }, description: 'Rule ids to measure; omit for all enabled rules.' },
      },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async (args) => {
      const snapshot = await engine.scan({ ruleIds: args?.rules })
      return summarize(snapshot)
    },
  }

  const state = {
    name: 'disk_state',
    description: 'Read the last disk snapshot without measuring anything: categories, sizes, the index of big files and the existing cleanup suggestions.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => summarize(await engine.snapshot()),
  }

  const propose = {
    name: 'disk_propose',
    description: 'Submit your analysis as categories with cleanup suggestions. Replaces categories with the same id. Each suggestion must be complete: method is trash, delete or command; paths or command must do exactly what the label says.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        categories: {
          type: 'array',
          description: 'Categories to add or replace.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'family', 'name', 'bytes', 'cleanup'],
            properties: {
              id: { type: 'string' },
              family: { type: 'string', enum: ['content', 'tools', 'caches', 'system'] },
              name: { type: 'string' },
              note: { type: 'string' },
              bytes: { type: 'number' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    path: { type: 'string' },
                    bytes: { type: 'number' },
                  },
                },
              },
              cleanup: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'label', 'why', 'bytes', 'safety', 'method'],
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    why: { type: 'string' },
                    bytes: { type: 'number' },
                    safety: { type: 'string', enum: ['safe', 'review', 'careful'] },
                    method: { type: 'string', enum: ['trash', 'delete', 'command'] },
                    paths: { type: 'array', items: { type: 'string' } },
                    command: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        headline: { type: 'string', description: 'One sentence on where the space went.' },
        summary: { type: 'string', description: 'Short paragraph naming what you looked at and what has little to clean.' },
        remove: { type: 'array', items: { type: 'string' }, description: 'Category ids to drop.' },
      },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async (args) => engine.propose(args),
  }

  const clean = {
    name: 'disk_clean',
    description: 'Run the cleanup suggestions the user selected. Paths go to the Trash unless the settings allow direct deletion. Returns freed bytes and per-step results.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['ids'],
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Candidate ids from disk_state.' },
      },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async (args) => {
      const result = await engine.clean(args?.ids, { by: 'model' })
      const lines = ['释放约 ' + formatBytes(result.freed) + '。']
      for (const row of result.results) lines.push('- ' + row.label + '：' + row.state + (row.message ? '（' + row.message + '）' : ''))
      return lines.join('\n')
    },
  }

  return [scan, state, propose, clean]
}