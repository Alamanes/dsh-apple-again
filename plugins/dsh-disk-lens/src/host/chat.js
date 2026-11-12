// The panel's own conversation. It lives inside the plugin: a small loop over
// llm.stream that gives the model three disk tools. Nothing is written into the
// user's DSH sessions, so the panel chat is a fresh conversation every time.

import { candidatesOf } from './tools.js'

const MAX_ROUNDS = 8
const HISTORY_MESSAGES = 24
const TOOL_TIMEOUT_MS = 600_000

function fmt(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e11 ? 0 : 1) + ' G'
  return Math.max(0, value / 1e6).toFixed(0) + ' M'
}

function summaryOf(snapshot) {
  if (snapshot === null) return '还没有扫描结果。先调用 disk_scan。'
  const lines = ['磁盘：已用 ' + fmt(snapshot.disk.used) + '，可用 ' + fmt(snapshot.disk.free) + '，总计 ' + fmt(snapshot.disk.total) + '。']
  for (const category of [...snapshot.categories].sort((a, b) => b.bytes - a.bytes).slice(0, 14)) {
    lines.push('- ' + category.name + '（' + category.family + '）：' + fmt(category.bytes) + '，' + category.items.length + ' 项')
  }
  const candidates = candidatesOf(snapshot)
  if (candidates.length > 0) {
    lines.push('', '已有建议：')
    for (const candidate of candidates.slice(0, 16)) {
      lines.push('  ' + candidate.id + ' · ' + candidate.label + ' · ' + fmt(candidate.bytes) + ' · ' + candidate.method + '/' + candidate.safety)
    }
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = [
  '你是「盘面」里的磁盘分析助手。面板有一张规则扫描表，你的价值是看懂数据、补规则没覆盖的地方、给出可执行的清理建议。',
  '',
  '工具：',
  '- disk_state：读上次快照摘要，不测量。先调用它。',
  '- disk_scan：用规则表重新测量，可选 rules 限定范围。要几十秒到几分钟。',
  '- disk_propose：提交或替换分类与清理建议。这是你写回面板的唯一方式。',
  '',
  '规则：',
  '1. 只读测量，不执行删除；删除由用户在面板勾选并确认。',
  '2. 建议要具体：路径写到要删的那一层，说明重建成本，safety 用 safe/review/careful。',
  '3. 用户自己的内容最多 careful，并说明后果。',
  '4. 没测到的地方说清楚，不编数字。',
  '5. 中文回答，句子短，先给结论。',
].join('\n')

export function createChat({ engine, getLlm, getSelection }) {
  const state = { messages: [], running: false, error: '', model: null, transcript: [] }
  let abort = null

  function modelOf() {
    if (state.model !== null && state.model.provider && state.model.model) return state.model
    const fallback = getSelection?.() ?? null
    return fallback === null ? null : { provider: fallback.provider, model: fallback.model, reasoningEffort: fallback.reasoningEffort ?? 'low' }
  }

  function toolSpecs() {
    return [
      {
        name: 'disk_state',
        description: 'Read the last disk snapshot: categories, sizes and cleanup suggestions. Does not measure.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => {
          await engine.load()
          return summaryOf(engine.snapshot)
        },
      },
      {
        name: 'disk_scan',
        description: 'Measure the disk with the rule table. Takes a minute or more. rules limits the walk.',
        inputSchema: {
          type: 'object',
          properties: { rules: { type: 'array', items: { type: 'string' }, description: 'Rule ids; omit for all.' } },
        },
        run: async (args) => summaryOf(await engine.scan({ ruleIds: Array.isArray(args?.rules) ? args.rules : undefined })),
      },
      {
        name: 'disk_propose',
        description: 'Submit or replace categories with cleanup suggestions. Writes back to the panel.',
        inputSchema: {
          type: 'object',
          properties: {
            categories: {
              type: 'array',
              items: {
                type: 'object',
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
                      properties: { label: { type: 'string' }, path: { type: 'string' }, bytes: { type: 'number' } },
                    },
                  },
                  cleanup: {
                    type: 'array',
                    items: {
                      type: 'object',
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
            remove: { type: 'array', items: { type: 'string' } },
            headline: { type: 'string' },
            summary: { type: 'string' },
          },
        },
        run: async (args) => engine.propose(args),
      },
    ]
  }

  async function send(userText) {
    if (state.running) throw new Error('上一轮还在运行')
    const text = String(userText ?? '').trim()
    if (text === '') throw new Error('消息是空的')
    const model = modelOf()
    const llm = getLlm()
    if (!llm || !model) throw new Error('没有可用的模型')

    state.error = ''
    state.running = true
    abort = new AbortController()
    if (state.transcript.length === 0) {
      state.transcript.push({ role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] })
    }
    state.transcript.push({ role: 'user', content: [{ type: 'text', text }] })
    state.messages.push({ id: 'u-' + Date.now(), role: 'user', text, blocks: [], at: new Date().toISOString() })
    const view = { id: 'a-' + Date.now(), role: 'assistant', blocks: [], at: new Date().toISOString(), streaming: true }
    state.messages.push(view)
    if (state.messages.length > 80) state.messages = state.messages.slice(-80)

    const specs = toolSpecs()
    const tools = specs.map((spec) => ({ name: spec.name, description: spec.description, inputSchema: spec.inputSchema }))

    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (abort.signal.aborted) break
        const chunks = []
        let textIndex = -1
        const stream = llm.stream({
          provider: model.provider,
          model: model.model,
          ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
          messages: state.transcript.slice(-HISTORY_MESSAGES),
          tools,
          signal: abort.signal,
        })
        for await (const chunk of stream) {
          chunks.push(chunk)
          if (chunk.type === 'text-delta') {
            if (textIndex < 0) {
              view.blocks.push({ type: 'text', text: '' })
              textIndex = view.blocks.length - 1
            }
            view.blocks[textIndex].text += chunk.text
          }
        }
        const finish = chunks.find((chunk) => chunk.type === 'finish')
        if (finish?.reason?.kind === 'error') throw new Error(finish.reason.failure?.message ?? '模型调用失败')
        if (finish?.reason?.kind === 'aborted') break

        const blocks = []
        const calls = []
        for (const chunk of chunks) {
          if (chunk.type !== 'block-end' || !chunk.block) continue
          const block = chunk.block
          if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
          else if (block.type === 'reasoning') blocks.push({ type: 'reasoning', text: block.text })
          else if (block.type === 'tool-call') { blocks.push(block); calls.push(block) }
        }
        state.transcript.push({
          role: 'assistant',
          source: { provider: model.provider, model: model.model, ...(finish?.replayState ? { replayState: finish.replayState } : {}) },
          content: blocks,
        })
        if (calls.length === 0) break

        for (const call of calls) {
          const spec = specs.find((item) => item.name === call.name)
          const chip = { type: 'tool', name: call.name, state: 'running', detail: String(call.arguments ?? '').slice(0, 120) }
          view.blocks.push(chip)
          let output = ''
          try {
            if (!spec) throw new Error('未知工具 ' + call.name)
            const args = call.arguments ? JSON.parse(call.arguments) : {}
            output = await Promise.race([
              spec.run(args),
              new Promise((_, reject) => setTimeout(() => reject(new Error('工具超过 10 分钟')), TOOL_TIMEOUT_MS)),
            ])
            chip.state = 'done'
            chip.detail = String(output).slice(0, 160)
          } catch (error) {
            chip.state = 'failed'
            chip.detail = String(error instanceof Error ? error.message : error)
            output = '工具失败：' + chip.detail
          }
          state.transcript.push({ role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: String(output) }], isError: chip.state === 'failed' })
        }
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error)
      if (view.blocks.length === 0) view.blocks.push({ type: 'text', text: '（' + state.error + '）' })
    } finally {
      view.streaming = false
      state.running = false
      abort = null
    }
  }

  return {
    state: () => ({
      messages: state.messages,
      running: state.running,
      error: state.error,
      model: modelOf(),
      tools: toolSpecs().map((spec) => spec.name),
    }),
    send,
    cancel() { if (abort !== null) { abort.abort(); return true } return false },
    clear() { state.messages = []; state.transcript = []; state.error = '' },
    setModel(next) {
      if (next && next.provider && next.model) {
        state.model = { provider: next.provider, model: next.model, reasoningEffort: next.reasoningEffort ?? 'low' }
      }
      return modelOf()
    },
  }
}
