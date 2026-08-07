// ============================================================================
// MORPHEUS - Chat Utilities
// Funções utilitárias para o módulo de chat
// ============================================================================

import type { ConversationMessage, MessagePart, TextPart } from '../types'

// -----------------------------------------------------------------------------
// Sleep Utility
// -----------------------------------------------------------------------------
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// -----------------------------------------------------------------------------
// JSON Utilities
// -----------------------------------------------------------------------------
export function safeJsonParse<T = Record<string, unknown>>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// -----------------------------------------------------------------------------
// Text Utilities
// -----------------------------------------------------------------------------
export function compactarTexto(texto: string, limite: number): string {
  const valor = String(texto || '').trim()
  if (!valor || valor.length <= limite) return valor
  const metade = Math.max(200, Math.floor((limite - 40) / 2))
  return `${valor.slice(0, metade)}\n...[contexto compactado]...\n${valor.slice(-metade)}`
}

export function estimarTokensTexto(texto: string): number {
  return Math.ceil(String(texto || '').length / 4)
}

export function estimarTokensConteudo(content: string | MessagePart[] | null): number {
  if (typeof content === 'string') return estimarTokensTexto(content)
  if (!Array.isArray(content)) return 0
  return content.reduce((total, parte) => {
    if (parte.type === 'text') return total + estimarTokensTexto(parte.text || '')
    if (parte.type === 'image_url') return total + 512
    return total
  }, 0)
}

// -----------------------------------------------------------------------------
// Message Utilities
// -----------------------------------------------------------------------------
export function extrairTextoConteudo(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is TextPart => Boolean(part) && typeof part === 'object' && part.type === 'text')
    .map((part) => String(part.text || ''))
    .join('\n')
    .trim()
}

export function contemImagem(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some((part: any) => part?.type === 'image_url' && Boolean(part?.image_url?.url))
}

export function mensagensContemImagem(messages: ConversationMessage[]): boolean {
  return messages.some((message) => contemImagem(message.content))
}

export function ultimaMensagemTexto(messages: ConversationMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return extrairTextoConteudo(messages[index].content)
    }
  }
  return ''
}

// -----------------------------------------------------------------------------
// Message Normalization
// -----------------------------------------------------------------------------
export function normalizarMensagensEntrada(messages: Array<{ role: string; content: string | MessagePart[] | null }>): ConversationMessage[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : message.role === 'tool' ? 'tool' : 'user',
    content: message.content,
  })) as ConversationMessage[]
}

// -----------------------------------------------------------------------------
// Task Classification
// -----------------------------------------------------------------------------
export function selectEffortLevel(userMessage: string): 'low' | 'medium' | 'high' {
  const msg = userMessage.toLowerCase()
  if (/clima|temperatura|hora|piada|calcul|convert/.test(msg)) return 'low'
  if (/refator|arquitet|migr|implement|criar.*sistema|bug.*critic|erro|deploy/.test(msg)) return 'high'
  return 'medium'
}

export function inferirTipoTarefa(userMessage: string): 'debug' | 'codigo' | 'analise' | 'multimodal' | 'rapido' | 'padrao' {
  const msg = userMessage.toLowerCase()
  if (/erro|bug|falha|debug|corrig/.test(msg)) return 'debug'
  if (/codigo|fun[çc][aã]o|arquivo|repo|commit|typescript|javascript|react|backend|frontend/.test(msg)) return 'codigo'
  if (/analise|arquitetura|compar|investig/.test(msg)) return 'analise'
  if (/imagem|audio|video|multimodal/.test(msg)) return 'multimodal'
  if (/quanto|clima|temperatura|hora/.test(msg)) return 'rapido'
  return 'padrao'
}

// -----------------------------------------------------------------------------
// Task Detection
// -----------------------------------------------------------------------------
export function tarefaProvavelmenteExigeTools(userMessage: string): boolean {
  const msg = userMessage.toLowerCase()
  return /github|reposit[oó]rio|repo\b|arquivo\b|file\b|commit\b|pull request|branch\b|supabase|tabela\b|banco de dados|web search|busca na web|pesquise|pesquisar|not[íi]cia atual|dados atuais|deploy|vercel|render|tool\b|ferramenta\b/.test(msg)
}

export function respostaPareceSimularTool(texto: string): boolean {
  const msg = texto.toLowerCase()
  return /\b(execu(te|tei|tamos)|usei|utilizei|chamei|rodei|acionei)\b.*\b(tool|ferramenta|github|supabase|web search|busca)\b/.test(msg)
    || /tool\s+call|tool_result|github_list_repos|github_read_file|github_list_files|supabase_query|web_search/.test(msg)
}

// Re-export constants
export { CHAT_CONSTANTS, READ_ONLY_TOOLS } from '../types'
