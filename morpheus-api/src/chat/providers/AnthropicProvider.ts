// ============================================================================
// MORPHEUS - Anthropic Provider
// Provedor de IA para Anthropic (Messages API)
// ============================================================================

import { BaseProvider, type ProviderConfig, type ProviderOptions } from './BaseProvider'
import type { ConversationMessage, ToolDefinition, ProviderResponse, TextPart, ImagePart } from '../types'
import { extrairTextoConteudo, parseDataUrl } from '../utils'

export class AnthropicProvider extends BaseProvider {
  constructor(apiKey: string, modelId: string, options: ProviderOptions = {}) {
    super(
      {
        provider: 'anthropic',
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
    return 'https://api.anthropic.com/v1/messages'
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    }
  }

  buildPayload(
    conversation: ConversationMessage[],
    tools?: ToolDefinition[],
  ): Record<string, unknown> {
    const systemMessage = conversation.find((m) => m.role === 'system')
    const systemPrompt = systemMessage ? extrairTextoConteudo(systemMessage.content) : ''

    return {
      model: this.config.modelId,
      max_tokens: Math.min(this.config.maxTokens, 4096),
      system: systemPrompt,
      messages: this.convertConversationToAnthropic(conversation),
      tools: this.config.supportsTools && tools ? this.convertToolsToAnthropic(tools) : undefined,
    }
  }

  extractResponse(data: Record<string, unknown>): ProviderResponse {
    const blocks = Array.isArray(data.content) ? data.content as Array<Record<string, unknown>> : []
    const text = blocks
      .filter((block) => block.type === 'text')
      .map((block) => String(block.text || ''))
      .join('\n')
      .trim()

    const toolCalls = blocks
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        id: String(block.id || crypto.randomUUID()),
        function: {
          name: String(block.name || ''),
          arguments: JSON.stringify(block.input || {}),
        },
      }))

    return {
      choices: [{
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
        message: {
          content: text,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      }],
      usage: {
        total_tokens: Number(data.usage && typeof data.usage === 'object'
          ? (data.usage as Record<string, unknown>).input_tokens || 0
          : 0) + Number(data.usage && typeof data.usage === 'object'
          ? (data.usage as Record<string, unknown>).output_tokens || 0
          : 0),
      },
    }
  }

  isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  }

  extractErrorMessage(status: number, body: string): string {
    const providerLabel = 'Anthropic'

    if (status === 401 || status === 403) {
      return `${providerLabel}: autenticação/permissão falhou. ${body}`
    }

    if (status === 400 || status === 404) {
      return `${providerLabel}: modelo ou requisição rejeitada (${this.config.modelId}). ${body}`
    }

    return `${providerLabel}: ${body || `HTTP ${status}`}`
  }

  private convertToolsToAnthropic(tools: ToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }))
  }

  private convertConversationToAnthropic(conversation: ConversationMessage[]): Array<Record<string, unknown>> {
    return conversation
      .filter((item) => item.role !== 'system')
      .map((item) => {
        if (item.role === 'tool') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: item.tool_call_id,
              content: String(item.content || ''),
            }],
          }
        }

        if (item.role === 'assistant' && item.tool_calls?.length) {
          const content = this.convertContentToAnthropic(item.content)
          for (const toolCall of item.tool_calls) {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.function.name,
              input: this.safeJsonParse(toolCall.function.arguments, {}),
            })
          }
          return {
            role: 'assistant',
            content,
          }
        }

        return {
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: this.convertContentToAnthropic(item.content),
        }
      })
  }

  private convertContentToAnthropic(content: string | any[] | null): Array<Record<string, unknown>> {
    if (!Array.isArray(content)) {
      const text = String(content || '').trim()
      return text ? [{ type: 'text', text }] : []
    }

    const parts: Array<Record<string, unknown>> = []
    for (const part of content) {
      if (part.type === 'text' && part.text?.trim()) {
        parts.push({ type: 'text', text: part.text })
        continue
      }

      if (part.type === 'image_url' && part.image_url?.url) {
        const dataUrl = parseDataUrl(part.image_url.url)
        if (dataUrl) {
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: dataUrl.mimeType,
              data: dataUrl.data,
            },
          })
        } else {
          parts.push({
            type: 'image',
            source: {
              type: 'url',
              url: part.image_url.url,
            },
          })
        }
      }
    }

    return parts
  }

  private safeJsonParse<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
}
