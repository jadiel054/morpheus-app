// ============================================================================
// MORPHEUS - Context Manager
// Gerenciamento de contexto para conversas com LLM
// ============================================================================

import type { ConversationMessage, ToolDefinition } from '../types'
import {
  compactarTexto,
  estimarTokensTexto,
  estimarTokensConteudo,
  extrairTextoConteudo,
  normalizarMensagensEntrada,
  selectEffortLevel,
  inferirTipoTarefa,
  tarefaProvavelmenteExigeTools,
  CHAT_CONSTANTS,
} from '../utils'
import { montarPrompt } from '../../lib/prompts'
import { resolverModelo, resolverModeloAuto, extrairOrdemProviders, normalizarProvider } from '../../agents/modelRouter'
import type { ModeloConfig } from '../../agents/modelRouter'

// -----------------------------------------------------------------------------
// Context Manager Class
// -----------------------------------------------------------------------------
export class ContextManager {
  private readonly maxLoops: number
  private readonly maxContextMessages: number
  private readonly maxContextTokens: number
  private readonly maxSystemPromptChars: number
  private readonly githubDefaultOwner: string
  private readonly githubDefaultRepository: string

  constructor() {
    this.maxLoops = CHAT_CONSTANTS.MAX_LOOPS
    this.maxContextMessages = CHAT_CONSTANTS.MAX_CONTEXT_MESSAGES
    this.maxContextTokens = CHAT_CONSTANTS.MAX_CONTEXT_TOKENS_ESTIMATE
    this.maxSystemPromptChars = CHAT_CONSTANTS.MAX_SYSTEM_PROMPT_CHARS
    this.githubDefaultOwner = CHAT_CONSTANTS.GITHUB_DEFAULT_OWNER
    this.githubDefaultRepository = CHAT_CONSTANTS.GITHUB_DEFAULT_REPOSITORY
  }

  // ---------------------------------------------------------------------------
  // Initial Setup
  // ---------------------------------------------------------------------------

  initializeContext(
    messages: Array<{ role: string; content: string | any[] | null }>,
    systemPrompt?: string,
    tipoTarefa?: string,
  ): {
    conversation: ConversationMessage[]
    effortLevel: 'low' | 'medium' | 'high'
    tipoTarefa: string
    ultimaMensagem: string
  } {
    const mensagensNormalizadas = normalizarMensagensEntrada(messages)
    const ultimaMensagem = this.getUltimaMensagemTexto(mensagensNormalizadas)
    const effortLevel = selectEffortLevel(ultimaMensagem)
    const inferredTipoTarefa = inferirTipoTarefa(ultimaMensagem)

    const contextoSistema = this.buildSystemContext(tipoTarefa || inferredTipoTarefa, systemPrompt)

    return {
      conversation: [
        { role: 'system', content: contextoSistema },
        ...mensagensNormalizadas,
      ],
      effortLevel,
      tipoTarefa: tipoTarefa || inferredTipoTarefa,
      ultimaMensagem,
    }
  }

  // ---------------------------------------------------------------------------
  // System Context
  // ---------------------------------------------------------------------------

  private buildSystemContext(tipoTarefa: string, systemPrompt?: string): string {
    const basePrompt = montarPrompt(
      'planejamento',
      `Tipo de tarefa: ${tipoTarefa}\nSe o modelo atual não suportar tools ou visão para concluir a tarefa, explique isso claramente e sugira um modelo compatível.`,
    )
    const appContext = systemPrompt ? `--- CONTEXTO DO APP ---\n${systemPrompt}` : ''
    return compactarTexto([basePrompt, appContext].filter(Boolean).join('\n\n'), this.maxSystemPromptChars)
  }

  // ---------------------------------------------------------------------------
  // Message Utilities
  // ---------------------------------------------------------------------------

  private getUltimaMensagemTexto(messages: ConversationMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        return extrairTextoConteudo(messages[index].content)
      }
    }
    return ''
  }

  // ---------------------------------------------------------------------------
  // Context Compaction
  // ---------------------------------------------------------------------------

  compactContext(conversation: ConversationMessage[]): {
    conversation: ConversationMessage[]
    compacted: boolean
    removedMessages: number
  } {
    const systemMessages = conversation
      .filter((item) => item.role === 'system')

    const recentMessages: ConversationMessage[] = []
    let tokensEstimados = systemMessages.reduce((total, message) => total + this.estimarTokensMensagem(message), 0)

    for (let index = conversation.length - 1; index >= 0; index -= 1) {
      const atual = conversation[index]
      if (!atual || atual.role === 'system') continue

      const sanitizada = this.sanitizarMensagemContexto(atual)
      const custo = this.estimarTokensMensagem(sanitizada)

      if (recentMessages.length >= this.maxContextMessages && tokensEstimados + custo > this.maxContextTokens) {
        continue
      }
      if (recentMessages.length > 0 && tokensEstimados + custo > this.maxContextTokens) {
        continue
      }

      recentMessages.unshift(sanitizada)
      tokensEstimados += custo

      if (recentMessages.length >= this.maxContextMessages && tokensEstimados >= this.maxContextTokens) {
        break
      }
    }

    const originalNonSystemMessages = conversation.filter((item) => item.role !== 'system').length
    const removedMessages = Math.max(0, originalNonSystemMessages - recentMessages.length)

    return {
      conversation: [...systemMessages, ...recentMessages],
      compacted: removedMessages > 0,
      removedMessages,
    }
  }

  // ---------------------------------------------------------------------------
  // Message Sanitization
  // ---------------------------------------------------------------------------

  private sanitizarMensagemContexto(message: ConversationMessage): ConversationMessage {
    if (message.role === 'system') {
      return { ...message, content: compactarTexto(extrairTextoConteudo(message.content), this.maxSystemPromptChars) }
    }

    if (message.role === 'tool') {
      return { ...message, content: compactarTexto(extrairTextoConteudo(message.content), CHAT_CONSTANTS.MAX_TOOL_RESULT_CHARS) }
    }

    if (typeof message.content === 'string') {
      const limite = message.role === 'assistant' ? 2000 : 3000
      return {
        ...message,
        content: compactarTexto(message.content, limite),
      }
    }

    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((parte: any) => (
          parte.type === 'text'
            ? { ...parte, text: compactarTexto(parte.text || '', 2000) }
            : parte
        )),
      }
    }

    return message
  }

  private estimarTokensMensagem(message: ConversationMessage): number {
    const base = estimarTokensConteudo(message.content)
    const toolCalls = (message.tool_calls || []).reduce(
      (total, toolCall: any) => total + estimarTokensTexto(toolCall.function.name || '') + estimarTokensTexto(toolCall.function.arguments || ''),
      0,
    )
    return base + toolCalls + 12
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  getContextDiagnostics(conversation: ConversationMessage[]): {
    mensagens: number
    tamanhoContexto: number
    tokensEstimados: number
  } {
    const mensagens = conversation.length
    const tamanhoContexto = conversation.reduce((total, message) => {
      const toolCalls = (message.tool_calls || []).reduce(
        (subtotal: number, toolCall: any) => subtotal + String(toolCall.function.arguments || '').length + String(toolCall.function.name || '').length,
        0,
      )
      return total + extrairTextoConteudo(message.content).length + toolCalls
    }, 0)

    return {
      mensagens,
      tamanhoContexto,
      tokensEstimados: conversation.reduce((total, message) => total + this.estimarTokensMensagem(message), 0),
    }
  }

  getTokenBreakdown(conversation: ConversationMessage[], tools: ToolDefinition[]): {
    systemPromptTokens: number
    historyTokens: number
    toolResultTokens: number
    userTokens: number
    toolSchemaTokens: number
    totalTokens: number
  } {
    let systemPromptTokens = 0
    let historyTokens = 0
    let toolResultTokens = 0
    let userTokens = 0

    let ultimoIndiceUser = -1
    for (let index = conversation.length - 1; index >= 0; index -= 1) {
      if (conversation[index]?.role === 'user') {
        ultimoIndiceUser = index
        break
      }
    }

    conversation.forEach((message, index) => {
      const custo = this.estimarTokensMensagem(message)
      if (message.role === 'system') {
        systemPromptTokens += custo
        return
      }
      if (message.role === 'tool') {
        toolResultTokens += custo
        return
      }
      if (message.role === 'user' && index === ultimoIndiceUser) {
        userTokens += custo
        return
      }
      historyTokens += custo
    })

    const toolSchemaTokens = estimarTokensTexto(JSON.stringify(tools))
    const totalTokens = systemPromptTokens + historyTokens + toolResultTokens + userTokens + toolSchemaTokens

    return {
      systemPromptTokens,
      historyTokens,
      toolResultTokens,
      userTokens,
      toolSchemaTokens,
      totalTokens,
    }
  }

  // ---------------------------------------------------------------------------
  // Model Selection
  // ---------------------------------------------------------------------------

  getInitialModel(
    model: string | undefined,
    tipoTarefa: string,
    providerOrder: string[],
  ): ModeloConfig | null {
    const modeloAutomatico = this.resolveModeloAuto(providerOrder) || this.rotearModelo(tipoTarefa, providerOrder)

    if (model && model !== 'auto') {
      const personalizado = this.resolverModelo(model)
      if (personalizado) return personalizado
      return modeloAutomatico ? { ...modeloAutomatico, id: model } : null
    }

    return modeloAutomatico || null
  }

  private resolverModelo(model: string): ModeloConfig | null {
    return resolverModelo(model)
  }

  private resolveModeloAuto(providerOrder: string[]): ModeloConfig | null {
    return resolverModeloAuto(providerOrder)
  }

  private rotearModelo(tipoTarefa: string, providerOrder: string[]): ModeloConfig | null {
    return resolverModeloAuto(providerOrder)
  }

  // ---------------------------------------------------------------------------
  // Provider Order
  // ---------------------------------------------------------------------------

  getAvailableProviderOrder(
    apiKeys: Record<string, string> | undefined,
    providerOrder: string[] | undefined,
  ): string[] {
    return extrairOrdemProviders(providerOrder, apiKeys || {}, this.extrairProvidersDoAmbiente())
      .filter((provider) => Boolean(this.getApiKey(provider, apiKeys)))
  }

  private extrairProvidersDoAmbiente(): Array<'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'openai' | 'google'> {
    return Object.keys(process.env)
      .map((key) => {
        if (/^GROQ_API_KEY$/i.test(key)) return 'groq'
        if (/^CEREBRAS_API_KEY$/i.test(key)) return 'cerebras'
        if (/^OPENROUTER_API_KEY$/i.test(key)) return 'openrouter'
        if (/^(CLAUDE|ANTHROPIC)_API_KEY$/i.test(key)) return 'anthropic'
        if (/^OPENAI_API_KEY$/i.test(key)) return 'openai'
        if (/^(GEMINI|GOOGLE)_API_KEY$/i.test(key)) return 'google'
        return null
      })
      .filter(Boolean) as Array<'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'openai' | 'google'>
  }

  private getApiKey(provider: string, apiKeys?: Record<string, string>): string {
    const providerNormalizado = normalizarProvider(provider)
    if (!providerNormalizado) return ''

    const keyMap: Record<string, string[]> = {
      groq: ['groq'],
      cerebras: ['cerebras'],
      openrouter: ['openrouter', 'deepseek', 'qwen', 'glm'],
      anthropic: ['anthropic', 'claude'],
      openai: ['openai'],
      google: ['google', 'gemini'],
    }

    const keys = keyMap[providerNormalizado] || []
    for (const key of keys) {
      if (apiKeys?.[key]) return String(apiKeys[key]).trim()
      const envKey = this.getEnvKeyForProvider(providerNormalizado)
      if (envKey && process.env[envKey]) return String(process.env[envKey]).trim()
    }
    return ''
  }

  private getEnvKeyForProvider(provider: string): string | null {
    const envMap: Record<string, string> = {
      groq: 'GROQ_API_KEY',
      cerebras: 'CEREBRAS_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
    }
    return envMap[provider] || null
  }

  // ---------------------------------------------------------------------------
  // Task Detection
  // ---------------------------------------------------------------------------

  mensagensContemImagem(messages: ConversationMessage[]): boolean {
    return messages.some((message) => this.contemImagem(message.content))
  }

  private contemImagem(content: unknown): boolean {
    if (!Array.isArray(content)) return false
    return content.some((part: any) => part?.type === 'image_url' && Boolean(part?.image_url?.url))
  }

  taskRequiresTools(userMessage: string): boolean {
    return tarefaProvavelmenteExigeTools(userMessage)
  }

  checkModelCapabilities(
    modelo: ModeloConfig,
    userMessage: string,
    hasImage: boolean,
  ): { valid: boolean; errorMessage?: string } {
    if (hasImage && !modelo.suportaVisao) {
      return {
        valid: false,
        errorMessage: this.buildLimitationMessage('visao', modelo, userMessage),
      }
    }

    if (this.taskRequiresTools(userMessage) && !modelo.suportaTools) {
      return {
        valid: false,
        errorMessage: this.buildLimitationMessage('tools', modelo, userMessage),
      }
    }

    return { valid: true }
  }

  buildLimitationMessage(
    tipo: 'tools' | 'visao',
    modelo: ModeloConfig,
    userMessage: string = '',
  ): string {
    const modelosMesmoProvider = this.getModelNamesWithCapability(tipo, modelo.provider)
    const modelosGerais = this.getModelNamesWithCapability(tipo)
    const sugestoes = (modelosMesmoProvider.length ? modelosMesmoProvider : modelosGerais)
      .filter((nome) => nome !== modelo.nome)
      .slice(0, 4)

    const complementoPrompt = tipo === 'tools' && userMessage
      ? ` Pedido detectado: "${userMessage.slice(0, 160)}".`
      : ''

    const acao = tipo === 'tools' ? 'executar tools reais' : 'analisar imagens'

    const sugestaoTexto = sugestoes.length
      ? ` Sugestão: troque para ${sugestoes.join(', ')}.`
      : ''

    return `[MORPHEUS] O modelo atual (${modelo.nome}) não suporta ${acao}.${complementoPrompt}${sugestaoTexto}`
  }

  private getModelNamesWithCapability(
    capacidade: 'tools' | 'visao',
    provider?: string,
  ): string[] {
    const { MODELOS } = require('../../agents/modelRouter')
    return Object.values(MODELOS)
      .filter((modelo: any) => (capacidade === 'tools' ? modelo.suportaTools : modelo.suportaVisao))
      .filter((modelo: any) => !provider || modelo.provider === provider)
      .map((modelo: any) => modelo.nome)
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------
export const contextManager = new ContextManager()
