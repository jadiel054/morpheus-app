type RateLimitState = {
  provider?: string
  limitTokens?: number | null
  remainingTokens?: number | null
  usedTokens?: number | null
  requestedTokens?: number | null
  limitRequests?: number | null
  remainingRequests?: number | null
  resetTokens?: string | null
  resetRequests?: string | null
  retryAfter?: string | null
  lastError?: string | null
}

type ModelCallState = {
  callId: string
  timestamp: string
  loopCount: number
  provider: string
  model: string
  attempt: number
  tokens: number
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  status: 'running' | 'success' | 'error'
  error?: string | null
}

type ToolCallState = {
  toolCallId: string
  timestamp: string
  loopCount: number
  toolName: string
  toolArguments: string
  tokensReturned?: number | null
  timeMs?: number | null
  resultSize?: number | null
  status: 'running' | 'success' | 'error'
  error?: string | null
}

type FallbackState = {
  timestamp: string
  fromProvider: string
  fromModel: string
  toProvider: string
  toModel: string
  reason: string
  error: string
}

type LoopTransitionState = {
  fromLoop: number
  toLoop: number
  reason: string
  tools?: string[]
}

type ContextState = {
  memoryCount: number
  messagesSent: number
  contextSizeChars: number
  compacted: boolean
  removedMessages: number
}

type TokenState = {
  systemPromptTokens: number
  historyTokens: number
  memoryTokens: number
  toolResultTokens: number
  toolSchemaTokens: number
  userTokens: number
  completionTokens: number
  totalTokens: number
  promptTokens: number
  providerTotalTokens: number
}

type FinalDiagnosticState = {
  loops: number
  groqCalls: number
  toolCalls: number
  totalTokens: number
  tempoTotalMs: number
  maiorConsumidor: string
}

export type ObservabilityRequestState = {
  requestId: string
  conversationId: string
  startedAt: string
  updatedAt: string
  endedAt: string | null
  totalExecutionMs: number
  status: 'executando' | 'concluida' | 'erro'
  modelUsed: string
  providerUsed: string
  currentLoop: number
  totalLoops: number
  rateLimit: RateLimitState
  tokens: TokenState
  context: ContextState
  modelCalls: ModelCallState[]
  toolCalls: ToolCallState[]
  fallbacks: FallbackState[]
  loopTransitions: LoopTransitionState[]
  rawEvents: Array<Record<string, unknown>>
  finalDiagnostic: FinalDiagnosticState | null
  lastError: string | null
  pendingFallback?: { provider: string, model: string, error: string } | null
}

type Snapshot = {
  requests: ObservabilityRequestState[]
  updatedAt: string
}

const MAX_REQUESTS = 20
const MAX_RAW_EVENTS = 200

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function detectMaiorConsumidor(tokens: TokenState) {
  const pairs: Array<[string, number]> = [
    ['System Prompt', tokens.systemPromptTokens],
    ['History', tokens.historyTokens],
    ['Memory', tokens.memoryTokens],
    ['Tool Results', tokens.toolResultTokens],
    ['Tool Schemas', tokens.toolSchemaTokens],
    ['User', tokens.userTokens],
    ['Completion', tokens.completionTokens],
  ]
  const winner = pairs.sort((a, b) => b[1] - a[1])[0]
  return winner?.[0] || 'N/D'
}

function parseRateLimitFromError(errorText: string) {
  const text = toText(errorText)
  const match = text.match(/Limit\s+(\d+),\s*Used\s+(\d+),\s*Requested\s+(\d+)/i)
  if (!match) return null
  const limitTokens = Number(match[1])
  const usedTokens = Number(match[2])
  const requestedTokens = Number(match[3])
  return {
    limitTokens,
    usedTokens,
    requestedTokens,
    remainingTokens: Number.isFinite(limitTokens - usedTokens) ? limitTokens - usedTokens : null,
  }
}

function createEmptyRequest(requestId: string, conversationId = 'desconhecida'): ObservabilityRequestState {
  const now = new Date().toISOString()
  return {
    requestId,
    conversationId,
    startedAt: now,
    updatedAt: now,
    endedAt: null,
    totalExecutionMs: 0,
    status: 'executando',
    modelUsed: '',
    providerUsed: '',
    currentLoop: 0,
    totalLoops: 0,
    rateLimit: {},
    tokens: {
      systemPromptTokens: 0,
      historyTokens: 0,
      memoryTokens: 0,
      toolResultTokens: 0,
      toolSchemaTokens: 0,
      userTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      promptTokens: 0,
      providerTotalTokens: 0,
    },
    context: {
      memoryCount: 0,
      messagesSent: 0,
      contextSizeChars: 0,
      compacted: false,
      removedMessages: 0,
    },
    modelCalls: [],
    toolCalls: [],
    fallbacks: [],
    loopTransitions: [],
    rawEvents: [],
    finalDiagnostic: null,
    lastError: null,
    pendingFallback: null,
  }
}

class ObservabilityStore {
  private requests = new Map<string, ObservabilityRequestState>()

  private subscribers = new Map<string, (snapshot: Snapshot) => void>()

  private getOrCreate(requestId: string, conversationId?: string) {
    const existing = this.requests.get(requestId)
    if (existing) return existing
    const created = createEmptyRequest(requestId, conversationId)
    this.requests.set(requestId, created)
    this.prune()
    return created
  }

  private prune() {
    const sorted = [...this.requests.values()].sort((a, b) => (
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ))
    const toKeep = new Set(sorted.slice(0, MAX_REQUESTS).map((item) => item.requestId))
    for (const key of this.requests.keys()) {
      if (!toKeep.has(key)) this.requests.delete(key)
    }
  }

  private pushRawEvent(request: ObservabilityRequestState, event: Record<string, unknown>) {
    request.rawEvents.push(event)
    if (request.rawEvents.length > MAX_RAW_EVENTS) {
      request.rawEvents.splice(0, request.rawEvents.length - MAX_RAW_EVENTS)
    }
  }

  private notify() {
    const snapshot = this.getSnapshot()
    this.subscribers.forEach((listener) => listener(snapshot))
  }

  getSnapshot(): Snapshot {
    return {
      requests: [...this.requests.values()]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((item) => JSON.parse(JSON.stringify(item)) as ObservabilityRequestState),
      updatedAt: new Date().toISOString(),
    }
  }

  subscribe(listener: (snapshot: Snapshot) => void) {
    const id = `${Date.now()}-${Math.random()}`
    this.subscribers.set(id, listener)
    listener(this.getSnapshot())
    return () => {
      this.subscribers.delete(id)
    }
  }

  record(event: string, payload: Record<string, unknown>) {
    const requestId = toText(payload.requestId)
    if (!requestId) return

    const request = this.getOrCreate(requestId, toText(payload.conversationId, 'desconhecida'))
    const timestamp = toText(payload.timestamp, new Date().toISOString())
    request.updatedAt = timestamp
    if (payload.conversationId) request.conversationId = toText(payload.conversationId)
    this.pushRawEvent(request, { event, ...payload })

    switch (event) {
      case 'pipeline_start': {
        request.startedAt = timestamp
        request.status = 'executando'
        request.context.memoryCount = toNumber(payload.memoryCount, request.context.memoryCount)
        request.context.messagesSent = toNumber(payload.messagesCount, request.context.messagesSent)
        request.tokens.memoryTokens = toNumber(payload.memoryTokens, request.tokens.memoryTokens)
        request.modelUsed = toText(payload.initialModel, request.modelUsed)
        break
      }
      case 'loop_start': {
        request.currentLoop = toNumber(payload.loopCount, request.currentLoop)
        request.totalLoops = Math.max(request.totalLoops, request.currentLoop)
        request.context.messagesSent = toNumber(payload.messagesCount, request.context.messagesSent)
        request.context.contextSizeChars = toNumber(payload.contextSizeChars, request.context.contextSizeChars)
        request.context.compacted = Boolean(payload.compacted)
        request.context.removedMessages += Math.max(0, toNumber(payload.removedMessages, 0))
        break
      }
      case 'loop_transition': {
        request.loopTransitions.push({
          fromLoop: toNumber(payload.fromLoop),
          toLoop: toNumber(payload.toLoop),
          reason: toText(payload.reason),
          tools: Array.isArray(payload.tools) ? payload.tools.map((item) => String(item)) : undefined,
        })
        break
      }
      case 'fallback_attempt': {
        const toProvider = toText(payload.provider)
        const toModel = toText(payload.model)
        if (request.pendingFallback && (
          request.pendingFallback.provider !== toProvider || request.pendingFallback.model !== toModel
        )) {
          const pending = request.pendingFallback
          request.fallbacks.push({
            timestamp,
            fromProvider: pending.provider,
            fromModel: pending.model,
            toProvider,
            toModel,
            reason: /rate limit/i.test(pending.error) ? 'Rate Limit' : 'Falha no provider',
            error: pending.error,
          })
          request.pendingFallback = null
        }
        request.providerUsed = toProvider || request.providerUsed
        request.modelUsed = toModel || request.modelUsed
        break
      }
      case 'fallback_attempt_failed': {
        request.pendingFallback = {
          provider: toText(payload.provider),
          model: toText(payload.model),
          error: toText(payload.error),
        }
        break
      }
      case 'model_call_start': {
        const callId = toText(payload.callId)
        if (!callId) break
        request.providerUsed = toText(payload.provider, request.providerUsed)
        request.modelUsed = toText(payload.model, request.modelUsed)
        request.tokens.systemPromptTokens = toNumber(payload.systemPromptTokens, request.tokens.systemPromptTokens)
        request.tokens.historyTokens = toNumber(payload.historyTokens, request.tokens.historyTokens)
        request.tokens.toolResultTokens = toNumber(payload.toolResultTokens, request.tokens.toolResultTokens)
        request.tokens.toolSchemaTokens = toNumber(payload.toolSchemaTokens, request.tokens.toolSchemaTokens)
        request.tokens.userTokens = toNumber(payload.userTokens, request.tokens.userTokens)
        request.tokens.totalTokens = toNumber(payload.totalTokens, request.tokens.totalTokens)
        request.context.contextSizeChars = toNumber(payload.contextSizeChars, request.context.contextSizeChars)
        request.context.messagesSent = toNumber(payload.messagesCount, request.context.messagesSent)
        request.modelCalls.push({
          callId,
          timestamp,
          loopCount: toNumber(payload.loopCount),
          provider: toText(payload.provider),
          model: toText(payload.model),
          attempt: toNumber(payload.attempt),
          tokens: toNumber(payload.totalTokens),
          status: 'running',
        })
        break
      }
      case 'model_call_success':
      case 'model_call_error': {
        const callId = toText(payload.callId)
        const modelCall = request.modelCalls.find((item) => item.callId === callId)
        const status = event === 'model_call_success' ? 'success' : 'error'
        const rateLimit = typeof payload.rateLimit === 'object' && payload.rateLimit
          ? payload.rateLimit as Record<string, unknown>
          : {}
        const rateLimitFromError = event === 'model_call_error'
          ? parseRateLimitFromError(toText(payload.error))
          : null

        if (modelCall) {
          modelCall.status = status
          modelCall.durationMs = toNullableNumber(payload.durationMs)
          modelCall.promptTokens = toNullableNumber(payload.promptTokens)
          modelCall.completionTokens = toNullableNumber(payload.completionTokens)
          modelCall.totalTokens = toNullableNumber(payload.totalTokens)
          modelCall.error = event === 'model_call_error' ? toText(payload.error) : null
        }

        request.tokens.completionTokens = toNumber(payload.completionTokens, request.tokens.completionTokens)
        request.tokens.promptTokens = toNumber(payload.promptTokens, request.tokens.promptTokens)
        request.tokens.providerTotalTokens = toNumber(payload.totalTokens, request.tokens.providerTotalTokens)
        request.rateLimit = {
          ...request.rateLimit,
          provider: toText(payload.provider, request.rateLimit.provider),
          limitTokens: toNullableNumber(rateLimit.limitTokens) ?? rateLimitFromError?.limitTokens ?? request.rateLimit.limitTokens ?? null,
          remainingTokens: toNullableNumber(rateLimit.remainingTokens) ?? rateLimitFromError?.remainingTokens ?? request.rateLimit.remainingTokens ?? null,
          usedTokens: rateLimitFromError?.usedTokens ?? request.rateLimit.usedTokens ?? null,
          requestedTokens: rateLimitFromError?.requestedTokens ?? request.rateLimit.requestedTokens ?? null,
          limitRequests: toNullableNumber(rateLimit.limitRequests) ?? request.rateLimit.limitRequests ?? null,
          remainingRequests: toNullableNumber(rateLimit.remainingRequests) ?? request.rateLimit.remainingRequests ?? null,
          resetTokens: toText(rateLimit.resetTokens, request.rateLimit.resetTokens || '') || null,
          resetRequests: toText(rateLimit.resetRequests, request.rateLimit.resetRequests || '') || null,
          retryAfter: toText(rateLimit.retryAfter, request.rateLimit.retryAfter || '') || null,
          lastError: event === 'model_call_error' ? toText(payload.error) : request.rateLimit.lastError || null,
        }
        if (event === 'model_call_error') {
          request.lastError = toText(payload.error)
        }
        break
      }
      case 'tool_call_start': {
        const toolCallId = toText(payload.toolCallId)
        request.toolCalls.push({
          toolCallId,
          timestamp,
          loopCount: toNumber(payload.loopCount),
          toolName: toText(payload.toolName),
          toolArguments: toText(payload.toolArguments),
          status: 'running',
        })
        break
      }
      case 'tool_call_success':
      case 'tool_call_error': {
        const toolCallId = toText(payload.toolCallId)
        const toolCall = request.toolCalls.find((item) => item.toolCallId === toolCallId)
        if (toolCall) {
          toolCall.status = event === 'tool_call_success' ? 'success' : 'error'
          toolCall.tokensReturned = toNullableNumber(payload.resultTokens)
          toolCall.timeMs = toNullableNumber(payload.executionMs)
          toolCall.resultSize = toNullableNumber(payload.toolResultSize)
          toolCall.error = event === 'tool_call_error' ? toText(payload.error) : null
        }
        break
      }
      case 'pipeline_summary':
      case 'pipeline_error': {
        request.endedAt = timestamp
        request.totalExecutionMs = toNumber(payload.totalExecutionMs, Math.max(
          0,
          new Date(timestamp).getTime() - new Date(request.startedAt).getTime(),
        ))
        request.totalLoops = toNumber(payload.loops, request.totalLoops)
        request.currentLoop = request.totalLoops
        request.status = event === 'pipeline_summary' ? 'concluida' : 'erro'
        request.lastError = event === 'pipeline_error' ? toText(payload.error) : request.lastError
        request.finalDiagnostic = {
          loops: toNumber(payload.loops),
          groqCalls: toNumber(payload.groqCalls),
          toolCalls: toNumber(payload.totalToolCalls),
          totalTokens: toNumber(payload.cumulativeEstimatedTokens),
          tempoTotalMs: request.totalExecutionMs,
          maiorConsumidor: detectMaiorConsumidor(request.tokens),
        }
        break
      }
      default:
        break
    }

    this.prune()
    this.notify()
  }
}

export const observabilityStore = new ObservabilityStore()
