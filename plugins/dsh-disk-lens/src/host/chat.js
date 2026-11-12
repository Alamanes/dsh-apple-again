// The in-panel conversation. It is a small agent loop of our own: the model
// calls the disk tools, the tools update the snapshot, and the panel polls the
// conversation state while text streams in. No DSH session is created, so the
// chat stays inside the panel.

import { candidatesOf } from './tools.js'

const MAX_ROUNDS = 8
const HISTORY_MESSAGES = 24
const TOOL_TIMEOUT_MS = 600_000

function textOf(blocks) {
  return (blocks ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('')
}

function summaryOf(snapshot) {
  if (snapshot === null) return '还没有扫描结果。先调用 disk_scan。'
  const lines = ['磁盘：已用 ' + fmt(snapshot.disk.used) + '，可用 ' + fmt(snapshot.disk.free) + '，总计 ' + fmt(snapshot.disk.total) + '。']
  const categories = [...snapshot.categories].sort((a, b) => b.bytes - a.bytes)
  for (const category of categories.slice(0, 14)) {
    lines.push('- ' + category.name + '（' + category.family + '）：' + fmt(category.bytes) + '，' + category.items.length + ' 项')
  }
  const candidates = candidatesOf(snapshot)
  if (candidates.length > 0) {
    lines.push('', '已有建议：')
    for (const candidate of candidates.slice(0, 16)) lines.push('  ' + candidate.id + ' · ' + candidate.label + ' · ' + fmt(candidate.bytes) + ' · ' + candidate.method + '/' + candidate.safety)
  }
  return lines.join('\n')
}

function fmt(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e11 ? 0 : 1) + ' G'
  return Math.max(0, value / 1e6).toFixed(0) + ' M'
}

const SYSTEM_PROMPT = [
  '你是「盘面」里的磁盘分析助手。面板已经有一套规则扫描器，你的价值是看懂数据、找规则没覆盖的地方、给出可执行的清理建议。',
  '',
  '工具：',
  '- disk_state：读上次扫描的快照摘要，不测量。先调用它。',
  '- disk_scan：用规则表重新测量，可选 rules 限定范围。要几十秒到几分钟。',
  '- disk_propose：提交或替换分类与清理建议。这是你写回面板的唯一方式。',
  '',
  '规则：',
  '1. 只读测量，不执行删除；删除由用户在面板里勾选并确认。',
  '2. 建议必须具体：路径写到要删的那一层，说明可重建成本，safety 用 safe/review/careful。',
  '3. 用户自己的内容（照片、文稿、聊天记录、项目源码、原始素材）最多 careful，并且要说明后果。',
  '4. 不确定就说不确定；没测到的地方说明原因，不要编数字。',
  '5. 回复用中文，句子短，先给结论。工具调用后会拿到结果，继续分析。',
].join('\n')

export function createChat({ engine, store, getLlm, getSelection }) {
  const state = {
    messages: [],
    running: false,
    error: '',
    model: null,
    transcript: [],
  }
  let abort = null

  function modelOf() {
    const saved = state.model
    if (saved !== null && saved.provider && saved.model) return saved
    const fallback = getSelection?.() ?? null
    return fallback !== null ? { provider: fallback.provider, model: fallback.model, reasoningEffort: fallback.reasoningEffort ?? 'low' } : null
  }

  function toolSpecs() {
    return [
      {
        name: 'disk_state',
        description: 'Read the last disk snapshot: categories, sizes and existing cleanup suggestions. Does not measure anything.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => {
          await engine.load()
          return summaryOf(engine.snapshot)
        },
      },
      {
        name: 'disk_scan',
        description: 'Measure the disk with the rule table and return the summary. Takes a minute or more. rules limits the walk to those rule ids.',
        inputSchema: {
          type: 'object',
          properties: { rules: { type: 'array', items: { type: 'string' }, description: 'Rule ids; omit for all enabled rules.' } },
        },
        run: async (args) => {
          const snapshot = await engine.scan({ ruleIds: Array.isArray(args?.rules) ? args.rules : undefined })
          return summaryOf(snapshot)
        },
      },
      {
        name: 'disk_propose',
        description: 'Submit or replace categories with cleanup suggestions. This is how you write back to the panel. Each suggestion must be complete and safe.',
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

  function pushMessage(message) {
    state.messages.push(message)
    if (state.messages.length > 80) state.messages = state.messages.slice(-80)
  }

  function toolView(message, name, detail) {
    message.blocks.push({ type: 'tool', name, state: 'running', detail: String(detail ?? '').slice(0, 180) })
    return message.blocks[message.blocks.length - 1]
  }

  async function send(userText) {
    if (state.running) throw new Error('上一轮还在运行')
    const text = String(userText ?? '').trim()
    if (text === '') throw new Error('消息是空的')
    const model = modelOf()
    const llm = getLlm()
    if (!llm || !model) throw new Error('没有可用的模型，请先在设置里选一个')

    state.error = ''
    state.running = true
    abort = new AbortController()
    const transcript = state.transcript
    if (transcript.length === 0) transcript.push({ role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] })
    transcript.push({ role: 'user', content: [{ type: 'text', text }] })
    pushMessage({ id: 'u-' + Date.now(), role: 'user', text, blocks: [], at: new Date().toISOString() })
    const view = { id: 'a-' + Date.now(), role: 'assistant', blocks: [], at: new Date().toISOString(), streaming: true }
    pushMessage(view)

    const specs = toolSpecs()
    const tools = specs.map((spec) => ({ name: spec.name, description: spec.description, inputSchema: spec.inputSchema }))

    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (abort.signal.aborted) break
        const chunks = []
        let textBlockIndex = -1
        let textIndex = -1
        const stream = llm.stream({
          provider: model.provider,
          model: model.model,
          ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
          messages: transcript.slice(-HISTORY_MESSAGES),
          tools,
          signal: abort.signal,
        })
        for await (const chunk of stream) {
          chunks.push(chunk)
          if (chunk.type === 'text-delta') {
            if (textIndex !== 0) {
              textIndex = 0
              view.blocks.push({ type: 'text', text: '' })
              textBlockIndex = view.blocks.length - 1
            }
            view.blocks[textBlockIndex].text += chunk.text
          }
        }
        const finish = chunks.find((chunk) => chunk.type === 'finish')
        if (finish && finish.reason && finish.reason.kind === 'error') {
          throw new Error(finish.reason.failure?.message ?? '模型调用失败')
        }
        if (finish && finish.reason && finish.reason.kind === 'aborted') break

        // assemble the assistant message from the raw chunks
        const blocks = []
        const calls = []
        for (const chunk of chunks) {
          if (chunk.type === 'block-end' && chunk.block) {
            const block = chunk.block
            if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
            else if (block.type === 'reasoning') blocks.push({ type: 'reasoning', text: block.text })
            else if (block.type === 'tool-call') { blocks.push(block); calls.push(block) }
          }
        }
        transcript.push({
          role: 'assistant',
          source: { provider: model.provider, model: model.model, ...(finish?.replayState ? { replayState: finish.replayState } : {}) },
          content: blocks,
        })
        if (calls.length === 0) break

        for (const call of calls) {
          const spec = specs.find((item) => item.name === call.name)
          const chip = toolView(view, call.name, call.arguments)
          let output = ''
          try {
            if (!spec) throw new Error('未知工具 ' + call.name)
            const args = call.arguments ? JSON.parse(call.arguments) : {}
            output = await Promise.race([
              spec.run(args),
              new Promise((_, reject) => setTimeout(() => reject(new Error('工具超过 10 分钟')), TOOL_TIMEOUT_MS)),
            ])
            chip.state = 'done'
            chip.detail = String(output).slice(0, 180)
          } catch (error) {
            chip.state = 'failed'
            chip.detail = String(error instanceof Error ? error.message : error)
            output = '工具失败：' + chip.detail
          }
          transcript.push({ role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: String(output) }], isError: chip.state === 'failed' })
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

  function cancel() {
    if (abort !== null) { abort.abort(); return true }
    return false
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
    cancel,
    setModel(next) {
      if (next && next.provider && next.model) state.model = { provider: next.provider, model: next.model, reasoningEffort: next.reasoningEffort ?? 'low' }
      return modelOf()
    },
    clear() {
      state.messages = []
      state.transcript = []
      state.error = ''
    },
  }
}
