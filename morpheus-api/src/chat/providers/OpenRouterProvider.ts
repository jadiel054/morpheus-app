// ============================================================================
// MORPHEUS - OpenRouter Provider
// Provedor de IA para OpenRouter (OpenAI-compatible API)
// ============================================================================

import { BaseProvider, type ProviderConfig, type ProviderOptions } from './BaseProvider'
import type { ConversationMessage, ToolDefinition, ProviderResponse } from '../types'

export class OpenRouterProvider extends BaseProvider {
  private readonly referer: string

  constructor(apiKey: string, modelId: string, options: ProviderOptions = {}) {
    super(
      {
        provider: 'openrouter',
        apiKey,
        modelId,
        supportsTools: true,
        supportsVision: false,
        maxTokens: 8192,
        temperature: 0.3,
      },
      options,
    )
    this.referer = process.env.FRONTEND_URL || 'https://morpheus-app-six.vercel.app'
  }

  getUrl(): string {
    return 'https://openrouter.ai/api/v1/chat/completions'
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': this.referer,
      'X-Title': 'MORPHEUS',
    }
  }

  buildPayload(
    conversation: ConversationMessage[],
    tools?: ToolDefinition[],
  ): Record<string, unknown> {
    return {
      model: this.config.modelId,
      messages: conversation,
      tools: this.config.supportsTools && tools ? tools : undefined,
      tool_choice: this.config.supportsTools && tools ? 'auto' : undefined,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    }
  }

  extractResponse(data: Record<string, unknown>): ProviderResponse {
    return data as ProviderResponse
  }

  isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  }

  extractErrorMessage(status: number, body: string): string {
    const providerLabel = 'OpenRouter'

    if (status === 401 || status === 403) {
      return `${providerLabel}: autenticação/permissão falhou. ${body}`
    }

    if (status === 400 || status === 404) {
      return `${providerLabel}: modelo ou requisição rejeitada (${this.config.modelId}). ${body}`
    }

    return `${providerLabel}: ${body || `HTTP ${status}`}`
  }
}
