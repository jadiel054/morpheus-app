// ============================================================================
// MORPHEUS - Google Provider
// Provedor de IA para Google Gemini
// ============================================================================

import { BaseProvider, type ProviderConfig, type ProviderOptions } from './BaseProvider'
import type { ConversationMessage, ToolDefinition, ProviderResponse, TextPart, ImagePart } from '../types'
import { extrairTextoConteudo, parseDataUrl } from '../utils'

export class GoogleProvider extends BaseProvider {
  constructor(apiKey: string, modelId: string, options: ProviderOptions = {}) {
    super(
      {
        provider: 'google',
        apiKey,
        modelId,
        supportsTools: true,
        supportsVision: true,
        maxTokens: 8192,
        temperature: 0.4,
      },
      options,
    )
  }

  getUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.config.modelId}:generateContent?key=${this.config.apiKey}`
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    }
  }

  buildPayload(
    conversation: ConversationMessage[],
    tools?: ToolDefinition[],
  ): Record<string, unknown> {
    const systemMessage = conversation.find((m) => m.role === 'system')
    const systemPrompt = systemMessage ? extrairTextoConteudo(systemMessage.content) : ''

    return {
      systemInstruction: systemPrompt ? { role: 'user', parts: [{ text: systemPrompt }] } : undefined,
      contents: this.convertConversationToGemini(conversation),
      tools: this.config.supportsTools && tools ? this.convertToolsToGemini(tools) : undefined,
      toolConfig: this.config.supportsTools ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
    }
  }

  extractResponse(data: Record<string, unknown>): ProviderResponse {
    const candidate = Array.isArray(data.candidates) ? data.candidates[0] as Record<string, unknown> : null
    const content = candidate?.content as Record<string, unknown> | undefined
    const parts = Array.isArray(content?.parts) ? content?.parts as Array<Record<string, unknown>> : []

    const texto = parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => String(part.text || ''))
      .join('\n')
      .trim()

    const toolCalls = parts
      .filter((part) => part.functionCall && typeof part.functionCall === 'object')
      .map((part) => {
        const functionCall = part.functionCall as Record<string, unknown>
        return {
          id: String(functionCall.id || crypto.randomUUID()),
          function: {
            name: String(functionCall.name || ''),
            arguments: JSON.stringify(functionCall.args || {}),
          },
        }
      })

    return {
      choices: [{
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
        message: {
          content: texto,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      }],
      usage: {
        total_tokens: Number(data.usageMetadata && typeof data.usageMetadata === 'object'
          ? (data.usageMetadata as Record<string, unknown>).totalTokenCount || 0
          : 0),
      },
    }
  }

  isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  }

  extractErrorMessage(status: number, body: string): string {
    const providerLabel = 'Google Gemini'

    if (status === 401 || status === 403) {
      return `${providerLabel}: autenticação/permissão falhou. ${body}`
    }

    if (status === 400 || status === 404) {
      return `${providerLabel}: modelo ou requisição rejeitada (${this.config.modelId}). ${body}`
    }

    return `${providerLabel}: ${body || `HTTP ${status}`}`
  }

  private convertToolsToGemini(tools: ToolDefinition[]): Array<Record<string, unknown>> {
    return [{
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: this.removeAdditionalPropertiesFromSchema(tool.function.parameters),
      })),
    }]
  }

  private convertConversationToGemini(conversation: ConversationMessage[]): Array<Record<string, unknown>> {
    return conversation
      .filter((item) => item.role !== 'system')
      .map((item) => {
        if (item.role === 'tool') {
          return {
            role: 'user',
            parts: [{
              functionResponse: {
                name: item.name || '',
                response: {
                  result: this.parseToolResult(String(item.content || '')),
                },
                ...(item.tool_call_id ? { id: item.tool_call_id } : {}),
              },
            }],
          }
        }

        const parts = Array.isArray(item.content)
          ? item.content.map(this.convertPartToGemini).filter(Boolean)
          : String(item.content || '').trim()
            ? [{ text: String(item.content || '') }]
            : []

        if (item.role === 'assistant' && item.tool_calls?.length) {
          const toolParts = item.tool_calls.map((toolCall) => ({
            functionCall: {
              name: toolCall.function.name,
              args: this.safeJsonParse(toolCall.function.arguments, {}),
              id: toolCall.id,
            },
          }))

          return {
            role: 'model',
            parts: [...parts, ...toolParts],
          }
        }

        return {
          role: item.role === 'assistant' ? 'model' : 'user',
          parts,
        }
      })
  }

  private convertPartToGemini(part: any): Record<string, unknown> | null {
    if (part.type === 'text') {
      return part.text?.trim() ? { text: part.text } : null
    }

    const dataUrl = parseDataUrl(part.image_url?.url || '')
    if (dataUrl) {
      return {
        inline_data: {
          mime_type: dataUrl.mimeType,
          data: dataUrl.data,
        },
      }
    }

    return {
      file_data: {
        mime_type: 'image/*',
        file_uri: part.image_url.url,
      },
    }
  }

  private removeAdditionalPropertiesFromSchema(schema: unknown): unknown {
    if (Array.isArray(schema)) {
      return schema.map(this.removeAdditionalPropertiesFromSchema)
    }

    if (!schema || typeof schema !== 'object') {
      return schema
    }

    const entrada = schema as Record<string, unknown>
    const saida: Record<string, unknown> = {}

    for (const [chave, valor] of Object.entries(entrada)) {
      if (chave === 'additionalProperties') continue
      saida[chave] = this.removeAdditionalPropertiesFromSchema(valor)
    }

    return saida
  }

  private parseToolResult(content: string): unknown {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }

  private safeJsonParse<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
}
