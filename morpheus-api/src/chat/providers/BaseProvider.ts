// ============================================================================
// MORPHEUS - Base Provider
// Classe abstrata para todos os provedores de IA
// ============================================================================

import type { Provider, ConversationMessage, ToolDefinition, ProviderResponse } from '../types'

export interface ProviderConfig {
  provider: Provider
  apiKey: string
  modelId: string
  supportsTools: boolean
  supportsVision: boolean
  maxTokens: number
  temperature: number
}

export interface ProviderOptions {
  maxRetries?: number
  retryDelay?: number
  timeout?: number
}

export abstract class BaseProvider {
  protected readonly config: ProviderConfig
  protected readonly options: Required<ProviderOptions>

  constructor(config: ProviderConfig, options: ProviderOptions = {}) {
    this.config = config
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      ...options,
    }
  }

  abstract getUrl(): string

  abstract getHeaders(): Record<string, string>

  abstract buildPayload(
    conversation: ConversationMessage[],
    tools?: ToolDefinition[],
  ): Record<string, unknown>

  abstract extractResponse(data: Record<string, unknown>): ProviderResponse

  abstract isRetryableStatus(status: number): boolean

  abstract extractErrorMessage(status: number, body: string): string

  async call(
    conversation: ConversationMessage[],
    tools?: ToolDefinition[],
  ): Promise<ProviderResponse> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(
          this.getUrl(),
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildPayload(conversation, tools)),
          },
          this.options.timeout,
        )

        if (!response.ok) {
          const body = await response.text()
          const errorMessage = this.extractErrorMessage(response.status, body)

          if (this.isRetryableStatus(response.status) && attempt < this.options.maxRetries) {
            await this.sleep(this.options.retryDelay * attempt)
            continue
          }

          throw new Error(errorMessage)
        }

        const data = await response.json()
        return this.extractResponse(data)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < this.options.maxRetries) {
          await this.sleep(this.options.retryDelay * attempt)
        }
      }
    }

    throw lastError || new Error('Failed to call provider')
  }

  protected async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getProvider(): Provider {
    return this.config.provider
  }

  getModelId(): string {
    return this.config.modelId
  }
}
