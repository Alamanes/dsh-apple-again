// One-off model calls for the memory review and the panel summary: the same route
// the conversation uses, streamed through the host's llm service, assembled by hand
// because a plugin does not import the harness packages.

const CALL_TIMEOUT_MS = 45_000

/**
 * The provider and model a request should use: the agent's current choice, else the
 * first provider that declares a model.
 * @param ctx - host plugin context.
 * @returns {provider, model, reasoningEffort?}
 */
export function routeOf(ctx) {
  let selection
  try {
    selection = ctx.get('agentDefaultModel', false)?.currentSelection?.()
  } catch {
    selection = undefined
  }
  if (selection !== undefined && selection !== null && typeof selection.provider === 'string' && typeof selection.model === 'string') {
    return { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort }
  }
  const llm = ctx.get('llm', false)
  const providers = typeof llm?.listProviders === 'function' ? llm.listProviders() : []
  const first = providers.find(entry => Array.isArray(entry?.models) && entry.models.length > 0)
  if (first !== undefined) return { provider: first.id ?? first.provider, model: first.models[0] }
  throw new Error('No model is available: add one in Harness settings.')
}

/**
 * The lowest reasoning effort the model offers, so a bookkeeping call does not pay
 * for deliberation. The host's own convention is efforts[0]: a model that can turn
 * thinking off lists "off" first. DeepSeek adapters accept "off"; the caller falls
 * back to no explicit effort when a model rejects it.
 */
let effortBroken = false

async function leastEffort(llm, route) {
  try {
    const info = await llm.resolveModelInfo?.({ provider: route.provider, model: route.model })
    const efforts = info?.reasoning?.efforts
    if (Array.isArray(efforts) && efforts.length > 0 && typeof efforts[0]?.id === 'string') return efforts[0].id
  } catch { /* older host: fall through to the literal */ }
  return 'off'
}

/**
 * Ask the model once and return its text.
 * @param ctx - host plugin context.
 * @param params.system - the system prompt.
 * @param params.text - the single user message.
 * @param params.maxTokens - the first output budget.
 * @param params.warn - logger for the discarded-reply case.
 */
export async function askOnce(ctx, { system, text, maxTokens = 8_192, warn = () => {} }) {
  const llm = ctx.get('llm', false)
  if (llm === undefined || typeof llm.stream !== 'function') throw new Error('The llm service is not available.')
  const route = routeOf(ctx)
  const effort = effortBroken ? undefined : await leastEffort(llm, route)

  const attempt = async (reasoningEffort) => {
    // Thinking tokens come out of the same budget, so a bookkeeping call still needs room
    // for deliberation before the first token of JSON exists.
    const budgets = [maxTokens, Math.min(maxTokens * 2, 32_768)]
    for (const budget of budgets) {
      let reply = ''
      let ending
      const options = {
        provider: route.provider,
        model: route.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text }] }],
        maxTokens: budget,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      }
      if (typeof reasoningEffort === 'string') options.reasoningEffort = reasoningEffort
      for await (const chunk of llm.stream(options)) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') reply += chunk.text
        else if (chunk?.type === 'finish') ending = chunk.reason
      }
      // The host reports the ending as { kind, failure }: a string compare here silently
      // matched nothing, so a budget exhausted by thinking was reported as an empty reply.
      const kind = ending?.kind ?? 'stop'
      const failure = ending?.failure ?? ending?.error
      if (kind === 'error' || kind === 'aborted') {
        throw new Error(failure?.message ?? (kind === 'aborted' ? '这次调用被中断了' : '模型调用失败'))
      }
      const trimmed = reply.trim()
      if (trimmed !== '') return trimmed
      if (kind !== 'max-tokens') throw new Error('模型这次没有输出内容')
      warn('dsh-user-memory: the model used its whole output budget on thinking; retrying with room')
    }
    throw new Error('模型把输出预算全用在思考上，没写出正文。')
  }

  try {
    return await attempt(effort)
  } catch (error) {
    const message = String(error?.message ?? '')
    // An empty reply is what a rejected effort looks like on some adapters, and the
    // session default is that same effort when the model lists only one: retry once
    // with no effort at all rather than re-asking under the effort that just failed.
    // An empty response is what a rejected effort looks like on some adapters, so both
    // an unsupported effort and an empty answer earn one retry with no effort at all.
    const worthRetrying = typeof effort === 'string' && /reasoning|effort|没有输出内容|no content|EMPTY_RESPONSE/i.test(message)
    if (!worthRetrying) throw error
    // A model that lists an effort but cannot honour it costs one wasted call; remember
    // it for this process so every later call goes straight to the model's own default.
    effortBroken = true
    warn('dsh-user-memory: reasoning effort "' + effort + '" produced nothing, retrying without it')
    return attempt(undefined)
  }
}
