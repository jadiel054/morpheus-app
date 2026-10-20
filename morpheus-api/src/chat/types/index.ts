// ============================================================================
// MORPHEUS - Chat Types
// Tipos compartilhados para o módulo de chat
// ============================================================================

// -----------------------------------------------------------------------------
// Providers
// -----------------------------------------------------------------------------
export type Provider = 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google' | 'cerebras'

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------
export type TextPart = { type: 'text'; text: string }
export type ImagePart = { type: 'image_url'; image_url: { url: string; detail?: string } }
export type MessagePart = TextPart | ImagePart

export type ToolCall = {
  id: string
  function: {
    name: string
    arguments: string
  }
}

export type ConversationMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | MessagePart[] | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

// -----------------------------------------------------------------------------
// Tool Types
// -----------------------------------------------------------------------------
export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

// -----------------------------------------------------------------------------
// Request/Response Types
// -----------------------------------------------------------------------------
export type ChatRequestPayload = {
  messages?: Array<{ role: string; content: string | MessagePart[] | null }>
  apiKeys?: Record<string, string>
  model?: string
  conversationId?: string
  providerOrder?: string[]
  systemPrompt?: string
  auditContext?: {
    memoryCount?: number
    memoryTokens?: number
  }
}

export type ChatExecutionResult = {
  content: string
  model: string
  loops: number
  tokensUsed: number
}

// -----------------------------------------------------------------------------
// Provider Response Types
// -----------------------------------------------------------------------------
export type ProviderResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string | MessagePart[] | null
      tool_calls?: ToolCall[]
      tool_call_id?: string
      name?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
export const CHAT_CONSTANTS = {
  MAX_LOOPS: 15,
  RETRY_DELAY: 1000,
  MAX_LLM_ATTEMPTS: 3,
  MAX_BUDGET_TOKENS: 100_000,
  MAX_CONTEXT_MESSAGES: 12,
  MAX_CONTEXT_TOKENS_ESTIMATE: 7_500,
  MAX_SYSTEM_PROMPT_CHARS: 3_500,
  MAX_TOOL_RESULT_CHARS: 1_200,
  MAX_REPEATED_TOOL_CALLS: 2,
  GITHUB_DEFAULT_OWNER: process.env.GITHUB_OWNER || 'jadiel054',
  GITHUB_DEFAULT_REPOSITORY: process.env.GITHUB_DEFAULT_REPOSITORY || 'morpheus-app',
} as const

export const READ_ONLY_TOOLS = [
  'github_list_repos',
  'github_list_repositories',
  'github_verify_connection',
  'github_resolve_repository',
  'github_read_file',
  'github_list_files',
  'supabase_query',
  'web_search',
  'create_plan',
  'get_plan',
] as const
