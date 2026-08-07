// ============================================================================
// MORPHEUS - OpenAI Provider
// Provedor de IA para OpenAI (Chat Completions API)
// ============================================================================

import { BaseProvider, type ProviderConfig, type ProviderOptions } from './BaseProvider'
import type { ConversationMessage, ToolDefinition, ProviderResponse } from '../types'

export class OpenAIProvider extends BaseProvider {
  constructor(apiKey: string, modelId: string, options: ProviderOptions = {}) {
    super(
      {
        provider: 'openai',
        apiKey,
        modelId,
        supportsTools: true,
        supportsVision: true,
        maxTokens: 8192,
        temperature: 0.3,
      },
      options,
    )
  }

  getUrl(): string {
    return 'https://api.openai.com/v1/chat/completions'
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
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
    const providerLabel = 'OpenAI'

    if (status === 401 || status === 403) {
      return `${providerLabel}: autenticação/permissão falhou. ${body}`
    }

    if (status === 400 || status === 404) {
      return `${providerLabel}: modelo ou requisição rejeitada (${this.config.modelId}). ${body}`
    }

    return `${providerLabel}: ${body || `HTTP ${status}`}`
  }
}
