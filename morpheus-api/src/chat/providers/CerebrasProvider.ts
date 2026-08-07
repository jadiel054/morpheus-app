// ============================================================================
// MORPHEUS - Cerebras Provider
// Provedor de IA para Cerebras (OpenAI-compatible API)
// ============================================================================

import { BaseProvider, type ProviderConfig, type ProviderOptions } from './BaseProvider'
import type { ConversationMessage, ToolDefinition, ProviderResponse } from '../types'
import { extrairTextoConteudo, parseDataUrl } from '../utils'

export class CerebrasProvider extends BaseProvider {
  constructor(apiKey: string, modelId: string, options: ProviderOptions = {}) {
    super(
      {
        provider: 'cerebras',
        apiKey,
        modelId,
        supportsTools: true,
        supportsVision: false,
        maxTokens: 8192,
        temperature: 0.3,
      },
      options,
    )
  }

  getUrl(): string {
    return 'https://api.cerebras.ai/v1/chat/completions'
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
      messages: this.convertConversationToCerebras(conversation),
      tools: this.config.supportsTools && tools ? this.convertToolsToCerebras(tools) : undefined,
      tool_choice: this.config.supportsTools && tools ? 'auto' : undefined,
      max_completion_tokens: Math.min(this.config.maxTokens, 4096),
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
    const providerLabel = 'Cerebras'

    if (status === 401 || status === 403) {
      return `${providerLabel}: autenticação/permissão falhou. ${body}`
    }

    if (status === 400 || status === 404) {
      return `${providerLabel}: modelo ou requisição rejeitada (${this.config.modelId}). ${body}`
    }

    return `${providerLabel}: ${body || `HTTP ${status}`}`
  }

  private convertToolsToCerebras(tools: ToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      ...tool,
      function: {
        ...tool.function,
        parameters: this.enforceStrictSchema(tool.function.parameters),
        strict: true,
      },
    }))
  }

  private convertConversationToCerebras(conversation: ConversationMessage[]): Array<Record<string, unknown>> {
    return conversation.map((item) => {
      if (item.role === 'assistant' && item.tool_calls?.length && this.config.modelId === 'llama-3.3-70b') {
        return {
          role: 'assistant',
          content: extrairTextoConteudo(item.content),
          tool_calls: [],
        }
      }

      return {
        ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
        ...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
        ...(item.name ? { name: item.name } : {}),
        role: item.role,
        content: item.content,
      }
    })
  }

  private enforceStrictSchema(schema: unknown): unknown {
    if (Array.isArray(schema)) {
      return schema.map(this.enforceStrictSchema)
    }

    if (!schema || typeof schema !== 'object') {
      return schema
    }

    const entrada = schema as Record<string, unknown>
    const saida: Record<string, unknown> = {}
    const requiredOriginais = new Set(
      Array.isArray(entrada.required)
        ? entrada.required.filter((item): item is string => typeof item === 'string')
        : [],
    )

    for (const [chave, valor] of Object.entries(entrada)) {
      if (chave === 'properties' && valor && typeof valor === 'object' && !Array.isArray(valor)) {
        const propriedadesEstritas = Object.fromEntries(
          Object.entries(valor as Record<string, unknown>).map(([nomePropriedade, schemaPropriedade]) => {
            const schemaEstrito = this.enforceStrictSchema(schemaPropriedade)
            return [
              nomePropriedade,
              requiredOriginais.has(nomePropriedade) ? schemaEstrito : this.allowNullInSchema(schemaEstrito),
            ]
          }),
        )
        saida[chave] = propriedadesEstritas
        continue
      }

      if (chave === 'additionalProperties') continue
      if (chave === 'required') continue
      saida[chave] = this.enforceStrictSchema(valor)
    }

    if (saida.type === 'object') {
      const properties = saida.properties
      if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        saida.properties = {}
      }
      saida.required = Object.keys(saida.properties as Record<string, unknown>)
      saida.additionalProperties = false
    }

    return saida
  }

  private allowNullInSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return schema
    }

    const saida: Record<string, unknown> = { ...(schema as Record<string, unknown>) }
    const tipoAtual = saida.type

    if (typeof tipoAtual === 'string') {
      saida.type = tipoAtual === 'null' ? ['null'] : [tipoAtual, 'null']
    } else if (Array.isArray(tipoAtual)) {
      saida.type = tipoAtual.includes('null') ? tipoAtual : [...tipoAtual, 'null']
    } else if (Array.isArray(saida.anyOf)) {
      const anyOf = saida.anyOf as Array<Record<string, unknown>>
      if (!anyOf.some((item) => item?.type === 'null')) {
        saida.anyOf = [...anyOf, { type: 'null' }]
      }
    }

    if (Array.isArray(saida.enum) && !saida.enum.includes(null)) {
      saida.enum = [...saida.enum, null]
    }

    return saida
  }
}
