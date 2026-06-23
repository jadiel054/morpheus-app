import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import { PlannerEngine, TOOLS_PLANNER } from '../agents/plannerEngine.js'
import { ReflectorEngine, TOOL_REFLECTOR } from '../agents/reflectorEngine.js'
import { podeExecutar, registrarSucesso, registrarFalha } from '../lib/circuitBreaker.js'
import { montarPrompt } from '../lib/prompts.js'
import {
  MODELOS,
  type ModeloConfig,
  rotearModelo,
  cadeiaDeFallback,
  resolverModelo,
  resolverModeloAuto,
  extrairOrdemProviders,
  normalizarProvider,
} from '../agents/modelRouter.js'
import { obterSupabaseAdmin, supabaseAdmin } from '../lib/supabaseAdmin.js'
import { branchProtegida, gerarBranchAutonomo, resumirExecucaoAutonoma } from '../lib/autonomyPolicy.js'
import { observabilityStore } from '../lib/observabilityStore.js'
import { githubDiagnosticsStore } from '../lib/githubDiagnostics.js'
import {
  GithubResolverError,
  createGithubBranchFromBase,
  createGithubPullRequest,
  getGithubContent,
  getGithubFileSha,
  putGithubFile,
  resolveGithubContext,
  resolveGithubRepository,
  verifyGithubConnection,
  listGithubRepositories,
} from '../lib/githubRepositoryResolver.js'

const router = Router()

const MAX_LOOPS = 15
const RETRY_DELAY = 1000
const MAX_LLM_ATTEMPTS = 3
const MAX_BUDGET_TOKENS = 100_000
const MAX_CONTEXT_MESSAGES = 12
const MAX_CONTEXT_TOKENS_ESTIMATE = 7_500
const MAX_SYSTEM_PROMPT_CHARS = 3_500
const MAX_TOOL_RESULT_CHARS = 1_200
const MAX_REPEATED_TOOL_CALLS = 2
const GITHUB_DEFAULT_OWNER = process.env.GITHUB_OWNER || 'jadiel054'
const GITHUB_DEFAULT_REPOSITORY = process.env.GITHUB_DEFAULT_REPOSITORY || 'morpheus-app'

type Provider = 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google' | 'cerebras'
type TextPart = { type: 'text', text: string }
type ImagePart = { type: 'image_url', image_url: { url: string, detail?: string } }
type MessagePart = TextPart | ImagePart
type ConversationMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | MessagePart[] | null
  tool_calls?: Array<{ id: string, function: { name: string, arguments: string } }>
  tool_call_id?: string
  name?: string
}

type AuditToolExecution = {
  loopCount: number
  toolName: string
  toolArguments: string
  executionMs: number
  toolResultSize: number
  resultTokens: number
}

type AuditLoopTransition = {
  fromLoop: number
  toLoop: number
  reason: string
  tools?: string[]
}

type AuditState = {
  requestId: string
  conversationId: string
  totalModelCalls: number
  groqCalls: number
  totalToolCalls: number
  cumulativeEstimatedTokens: number
  executedTools: AuditToolExecution[]
  loopTransitions: AuditLoopTransition[]
}

const READ_ONLY_TOOLS = [
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
]

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'github_list_repos',
      description: 'Lista repositórios reais do GitHub autenticado. Use para descoberta antes de ler ou editar qualquer repositório.',
      parameters: {
        type: 'object',
        properties: {
          contexto: { type: 'string', description: 'Opcional. Use vazio para listar os repositórios autenticados.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_verify_connection',
      description: 'Verifica autenticação do GitHub e retorna o usuário autenticado e a quantidade de repositórios reais disponíveis.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_repositories',
      description: 'Alias explícito para listar repositórios reais do GitHub autenticado.',
      parameters: {
        type: 'object',
        properties: {
          contexto: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_resolve_repository',
      description: 'Resolve o repositório real no GitHub a partir de nome informal como "Morpheus", "repo morpheus" ou contexto genérico do usuário.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Nome ou apelido informado pelo usuário.' },
          repository: { type: 'string', description: 'Alias para repo.' },
          owner: { type: 'string' },
          contexto: { type: 'string', description: 'Mensagem do usuário para ajudar a resolver o repositório padrão quando necessário.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Lê o conteúdo real de um arquivo do GitHub somente após validar owner, repo, branch e path contra a API real.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
          branch: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_files',
      description: 'Lista arquivos reais de um caminho no repositório após resolver e validar o repositório no GitHub.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
          branch: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_commit_file',
      description: 'Cria ou atualiza um arquivo em um repositório do GitHub somente após validar repositório, branch e path reais. Em autonomia, prefira branch temporária e PR.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          message: { type: 'string' },
          branch: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['path', 'content', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Cria uma nova branch usando como base a default_branch real retornada pela API do GitHub.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          branch: { type: 'string' },
          from: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pr',
      description: 'Abre pull request com mudanças feitas em branch temporária após validar o repositório real.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['title', 'head'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'supabase_query',
      description: 'Consulta uma tabela do Supabase.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          filter: { type: 'string', description: 'JSON string com filtros no formato {"campo":"valor"}' },
          columns: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'supabase_upsert',
      description: 'Insere ou atualiza dados em uma tabela do Supabase.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          data: { type: 'string', description: 'JSON string com objeto ou array de objetos para upsert' },
        },
        required: ['table', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Busca dados atuais na web.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
  ...TOOLS_PLANNER,
  TOOL_REFLECTOR,
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function logStructuredAudit(event: string, payload: Record<string, unknown>) {
  const enriched = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }
  console.info('[MORPHEUS][AUDIT]', JSON.stringify(enriched))
  observabilityStore.record(event, enriched)
}

function safeJsonParse<T = Record<string, unknown>>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseJsonStringArgument<T>(value: unknown, nomeCampo: string, fallback?: T): T {
  if (typeof value === 'string') {
    const conteudo = value.trim()
    if (!conteudo) {
      if (fallback !== undefined) return fallback
      throw new Error(`${nomeCampo} e obrigatorio`)
    }
    try {
      return JSON.parse(conteudo) as T
    } catch {
      throw new Error(`${nomeCampo} deve ser um JSON valido`)
    }
  }

  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback
    throw new Error(`${nomeCampo} e obrigatorio`)
  }

  return value as T
}

function removerAdditionalPropertiesDoSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(removerAdditionalPropertiesDoSchema)
  }

  if (!schema || typeof schema !== 'object') {
    return schema
  }

  const entrada = schema as Record<string, unknown>
  const saida: Record<string, unknown> = {}

  for (const [chave, valor] of Object.entries(entrada)) {
    if (chave === 'additionalProperties') continue
    saida[chave] = removerAdditionalPropertiesDoSchema(valor)
  }

  return saida
}

function permitirNuloNoSchema(schema: unknown): unknown {
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

function enforceStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(enforceStrictSchema)
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
          const schemaEstrito = enforceStrictSchema(schemaPropriedade)
          return [
            nomePropriedade,
            requiredOriginais.has(nomePropriedade) ? schemaEstrito : permitirNuloNoSchema(schemaEstrito),
          ]
        }),
      )
      saida[chave] = propriedadesEstritas
      continue
    }

    if (chave === 'additionalProperties') continue
    if (chave === 'required') continue
    saida[chave] = enforceStrictSchema(valor)
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

function normalizeApiKey(value: unknown) {
  return String(value || '').trim()
}

function compactarTexto(texto: string, limite: number) {
  const valor = String(texto || '').trim()
  if (!valor || valor.length <= limite) return valor
  const metade = Math.max(200, Math.floor((limite - 40) / 2))
  return `${valor.slice(0, metade)}\n...[contexto compactado]...\n${valor.slice(-metade)}`
}

function estimarTokensTexto(texto: string) {
  return Math.ceil(String(texto || '').length / 4)
}

function estimarTokensConteudo(content: string | MessagePart[] | null) {
  if (typeof content === 'string') return estimarTokensTexto(content)
  if (!Array.isArray(content)) return 0
  return content.reduce((total, parte) => {
    if (parte.type === 'text') return total + estimarTokensTexto(parte.text || '')
    if (parte.type === 'image_url') return total + 512
    return total
  }, 0)
}

function sanitizarToolCalls(
  toolCalls: Array<{ id: string, function: { name: string, arguments: string } }> | undefined,
) {
  return toolCalls?.map((toolCall) => ({
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: compactarTexto(toolCall.function.arguments || '', 800),
    },
  }))
}

function sanitizarMensagemContexto(message: ConversationMessage): ConversationMessage {
  if (message.role === 'system') {
    return { ...message, content: compactarTexto(extrairTextoConteudo(message.content), MAX_SYSTEM_PROMPT_CHARS) }
  }

  if (message.role === 'tool') {
    return { ...message, content: compactarTexto(extrairTextoConteudo(message.content), MAX_TOOL_RESULT_CHARS) }
  }

  if (typeof message.content === 'string') {
    const limite = message.role === 'assistant' ? 2_000 : 3_000
    return {
      ...message,
      content: compactarTexto(message.content, limite),
      ...(message.tool_calls ? { tool_calls: sanitizarToolCalls(message.tool_calls) } : {}),
    }
  }

  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content.map((parte) => (
        parte.type === 'text'
          ? { ...parte, text: compactarTexto(parte.text || '', 2_000) }
          : parte
      )),
      ...(message.tool_calls ? { tool_calls: sanitizarToolCalls(message.tool_calls) } : {}),
    }
  }

  return message.tool_calls
    ? { ...message, tool_calls: sanitizarToolCalls(message.tool_calls) }
    : message
}

function estimarTokensMensagem(message: ConversationMessage) {
  const base = estimarTokensConteudo(message.content)
  const toolCalls = (message.tool_calls || []).reduce(
    (total, toolCall) => total + estimarTokensTexto(toolCall.function.name || '') + estimarTokensTexto(toolCall.function.arguments || ''),
    0,
  )
  return base + toolCalls + 12
}

function diagnosticoContexto(conversation: Array<ConversationMessage>) {
  const mensagens = conversation.length
  const tamanhoContexto = conversation.reduce((total, message) => {
    const toolCalls = (message.tool_calls || []).reduce(
      (subtotal, toolCall) => subtotal + String(toolCall.function.arguments || '').length + String(toolCall.function.name || '').length,
      0,
    )
    return total + extrairTextoConteudo(message.content).length + toolCalls
  }, 0)

  return {
    mensagens,
    tamanhoContexto,
    tokensEstimados: conversation.reduce((total, message) => total + estimarTokensMensagem(message), 0),
  }
}

function calcularBreakdownTokens(
  conversation: Array<ConversationMessage>,
  tools: typeof TOOL_DEFINITIONS,
) {
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
    const custo = estimarTokensMensagem(message)
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

function extrairTextoConteudo(content: unknown) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is TextPart => Boolean(part) && typeof part === 'object' && (part as TextPart).type === 'text')
    .map((part) => String(part.text || ''))
    .join('\n')
    .trim()
}

function contemImagem(content: unknown) {
  return Array.isArray(content) && content.some((part) => (part as ImagePart)?.type === 'image_url' && Boolean((part as ImagePart)?.image_url?.url))
}

function mensagensContemImagem(messages: Array<ConversationMessage>) {
  return messages.some((message) => contemImagem(message.content))
}

function ultimaMensagemTexto(messages: Array<ConversationMessage>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return extrairTextoConteudo(messages[index].content)
    }
  }
  return ''
}

function parseDataUrl(url: string) {
  const match = url.match(/^data:(.+?);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function parseToolResult(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function tarefaProvavelmenteExigeTools(userMessage: string) {
  const msg = userMessage.toLowerCase()
  return /github|reposit[oó]rio|repo\b|arquivo\b|file\b|commit\b|pull request|branch\b|supabase|tabela\b|banco de dados|web search|busca na web|pesquise|pesquisar|not[ií]cia atual|dados atuais|deploy|vercel|render|tool\b|ferramenta\b/.test(msg)
}

function respostaPareceSimularTool(texto: string) {
  const msg = texto.toLowerCase()
  return /\b(execu(te|tei|tamos)|usei|utilizei|chamei|rodei|acionei)\b.*\b(tool|ferramenta|github|supabase|web search|busca)\b/.test(msg)
    || /tool\s+call|tool_result|github_list_repos|github_read_file|github_list_files|supabase_query|web_search/.test(msg)
}

function nomesModelosComCapacidade(capacidade: 'tools' | 'visao', provider?: Provider) {
  return Object.values(MODELOS)
    .filter((modelo) => (capacidade === 'tools' ? modelo.suportaTools : modelo.suportaVisao))
    .filter((modelo) => !provider || modelo.provider === provider)
    .map((modelo) => modelo.nome)
}

function montarMensagemLimitacao(
  tipo: 'tools' | 'visao',
  modelo: ModeloConfig,
  userMessage = '',
) {
  const opcoesMesmoProvider = nomesModelosComCapacidade(tipo, modelo.provider)
  const opcoesGerais = nomesModelosComCapacidade(tipo)
  const sugestoes = (opcoesMesmoProvider.length ? opcoesMesmoProvider : opcoesGerais)
    .filter((nome) => nome !== modelo.nome)
    .slice(0, 4)

  const complementoPrompt = tipo === 'tools' && userMessage
    ? ` Pedido detectado: "${userMessage.slice(0, 160)}".`
    : ''

  const acao = tipo === 'tools'
    ? 'executar tools reais'
    : 'analisar imagens'

  const sugestaoTexto = sugestoes.length
    ? ` Sugestão: troque para ${sugestoes.join(', ')}.`
    : ''

  return `[MORPHEUS] O modelo atual (${modelo.nome}) não suporta ${acao}.${complementoPrompt}${sugestaoTexto}`
}

function normalizarMensagensEntrada(messages: Array<{ role: string, content: string | MessagePart[] | null }>) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : message.role === 'tool' ? 'tool' : 'user',
    content: message.content,
  })) as ConversationMessage[]
}

function compactHistoryWithMeta(history: Array<ConversationMessage>) {
  const systemMessages = history
    .filter((item) => item.role === 'system')
    .map(sanitizarMensagemContexto)

  const recentMessages: Array<ConversationMessage> = []
  let tokensEstimados = systemMessages.reduce((total, message) => total + estimarTokensMensagem(message), 0)

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const atual = history[index]
    if (!atual || atual.role === 'system') continue
    const sanitizada = sanitizarMensagemContexto(atual)
    const custo = estimarTokensMensagem(sanitizada)
    if (recentMessages.length >= MAX_CONTEXT_MESSAGES && tokensEstimados + custo > MAX_CONTEXT_TOKENS_ESTIMATE) {
      continue
    }
    if (recentMessages.length > 0 && tokensEstimados + custo > MAX_CONTEXT_TOKENS_ESTIMATE) {
      continue
    }
    recentMessages.unshift(sanitizada)
    tokensEstimados += custo
    if (recentMessages.length >= MAX_CONTEXT_MESSAGES && tokensEstimados >= MAX_CONTEXT_TOKENS_ESTIMATE) {
      break
    }
  }

  const originalNonSystemMessages = history.filter((item) => item.role !== 'system').length
  const removedMessages = Math.max(0, originalNonSystemMessages - recentMessages.length)

  return {
    conversation: [...systemMessages, ...recentMessages],
    compacted: removedMessages > 0,
    removedMessages,
  }
}

function compactHistory(history: Array<ConversationMessage>) {
  return compactHistoryWithMeta(history).conversation
}

function selectEffortLevel(userMessage: string) {
  const msg = userMessage.toLowerCase()
  if (/clima|temperatura|hora|piada|calcul|convert/.test(msg)) return 'low'
  if (/refator|arquitet|migr|implement|criar.*sistema|bug.*critic|erro|deploy/.test(msg)) return 'high'
  return 'medium'
}

function inferirTipoTarefa(userMessage: string) {
  const msg = userMessage.toLowerCase()
  if (/erro|bug|falha|debug|corrig/.test(msg)) return 'debug'
  if (/codigo|fun[cç][aã]o|arquivo|repo|commit|typescript|javascript|react|backend|frontend/.test(msg)) return 'codigo'
  if (/analise|arquitetura|compar|investig/.test(msg)) return 'analise'
  if (/imagem|audio|video|multimodal/.test(msg)) return 'multimodal'
  if (/quanto|clima|temperatura|hora/.test(msg)) return 'rapido'
  return 'padrao'
}

function extrairProvidersDoAmbiente() {
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

function obterModeloInicial(model: string | undefined, tipoTarefa: string, providerOrder: string[]) {
  const modeloAutomatico = resolverModeloAuto(providerOrder) || rotearModelo(tipoTarefa, providerOrder)

  if (model && model !== 'auto') {
    const personalizado = resolverModelo(model)
    if (personalizado) return personalizado
    return modeloAutomatico ? { ...modeloAutomatico, id: model } : null
  }

  return modeloAutomatico || null
}

function obterApiKey(provider: string, apiKeys: Record<string, string> | undefined) {
  const providerNormalizado = normalizarProvider(provider)
  if (!providerNormalizado) return ''
  if (providerNormalizado === 'groq') return normalizeApiKey(apiKeys?.groq || process.env.GROQ_API_KEY || '')
  if (providerNormalizado === 'cerebras') return normalizeApiKey(apiKeys?.cerebras || process.env.CEREBRAS_API_KEY || '')
  if (providerNormalizado === 'openrouter') {
    return normalizeApiKey(
      apiKeys?.openrouter
      || apiKeys?.deepseek
      || apiKeys?.qwen
      || apiKeys?.glm
      || apiKeys?.openrouter_deepseek
      || apiKeys?.openrouter_qwen
      || apiKeys?.openrouter_glm
      || process.env.OPENROUTER_API_KEY
      || '',
    )
  }
  if (providerNormalizado === 'anthropic') return normalizeApiKey(apiKeys?.anthropic || apiKeys?.claude || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '')
  if (providerNormalizado === 'openai') return normalizeApiKey(apiKeys?.openai || process.env.OPENAI_API_KEY || '')
  return normalizeApiKey(apiKeys?.google || apiKeys?.gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '')
}

function extrairProviderOrderDisponivel(
  apiKeys: Record<string, string> | undefined,
  providerOrder: string[] | undefined,
) {
  return extrairOrdemProviders(providerOrder, apiKeys || {}, extrairProvidersDoAmbiente())
    .filter((provider) => Boolean(obterApiKey(provider, apiKeys)))
}

function obterUrlProvider(provider: 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'openai' | 'google', modelId: string, apiKey: string) {
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions'
  if (provider === 'cerebras') return 'https://api.cerebras.ai/v1/chat/completions'
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions'
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages'
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions'
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`
}

function criarHeadersProvider(provider: 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'openai' | 'google', apiKey: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    return headers
  }

  if (provider === 'google') {
    return headers
  }

  headers.Authorization = `Bearer ${apiKey}`

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.FRONTEND_URL || 'https://morpheus-app-six.vercel.app'
    headers['X-Title'] = 'MORPHEUS'
  }

  return headers
}

function construirPayloadProvider(
  modelo: ModeloConfig,
  conversation: Array<ConversationMessage>,
  tools: typeof TOOL_DEFINITIONS,
) {
  if (modelo.provider === 'anthropic') {
    return {
      model: modelo.id,
      max_tokens: Math.min(modelo.maxTokens, 4096),
      system: extrairTextoConteudo(conversation.find((item) => item.role === 'system')?.content || ''),
      messages: converterConversationParaAnthropic(conversation),
      tools: modelo.suportaTools ? converterToolsParaAnthropic(tools) : undefined,
    }
  }

  if (modelo.provider === 'google') {
    return {
      systemInstruction: { role: 'user', parts: [{ text: extrairTextoConteudo(conversation.find((item) => item.role === 'system')?.content || '') }] },
      contents: converterConversationParaGemini(conversation),
      tools: modelo.suportaTools ? converterToolsParaGemini(tools) : undefined,
      toolConfig: modelo.suportaTools ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
    }
  }

  if (modelo.provider === 'cerebras') {
    return {
      model: modelo.id,
      messages: converterConversationParaCerebras(conversation, modelo.id),
      tools: modelo.suportaTools ? converterToolsParaCerebras(tools) : undefined,
      tool_choice: modelo.suportaTools ? 'auto' : undefined,
      max_completion_tokens: Math.min(modelo.maxTokens, 4096),
      temperature: modelo.temperatura,
    }
  }

  return {
    model: modelo.id,
    messages: conversation,
    tools: modelo.suportaTools ? tools : undefined,
    tool_choice: modelo.suportaTools ? 'auto' : undefined,
    max_tokens: Math.min(modelo.maxTokens, 4096),
    temperature: modelo.temperatura,
  }
}

function serializarErro(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function extrairMensagemErroProvider(
  provider: 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'openai' | 'google',
  status: number,
  bodyText: string,
  modelId: string,
) {
  const body = safeJsonParse<Record<string, unknown>>(bodyText, { raw: bodyText })
  const providerLabel = {
    groq: 'Groq',
    cerebras: 'Cerebras',
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google Gemini',
  }[provider]

  const details =
    String(
      (body.error as Record<string, unknown> | undefined)?.message ||
      (body.error as Record<string, unknown> | undefined)?.details ||
      body.message ||
      body.error ||
      body.raw ||
      bodyText ||
      `HTTP ${status}`,
    )

  if (status === 401 || status === 403) {
    return `${providerLabel}: autenticacao/permissao falhou. ${details}`
  }

  if (status === 400 || status === 404) {
    return `${providerLabel}: modelo ou requisicao rejeitada (${modelId}). ${details}`
  }

  return `${providerLabel}: ${details}`
}

function statusEhRetriavel(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function extrairRetryAfterMs(retryAfter: string | null) {
  if (!retryAfter) return null

  const emSegundos = Number(retryAfter)
  if (Number.isFinite(emSegundos) && emSegundos >= 0) {
    return emSegundos * 1000
  }

  const dataRetry = Date.parse(retryAfter)
  if (Number.isNaN(dataRetry)) return null

  const diff = dataRetry - Date.now()
  return diff > 0 ? diff : null
}

function extrairRateLimitHeaders(headers: Headers) {
  return {
    limitTokens: toNullableNumberHeader(headers.get('x-ratelimit-limit-tokens')),
    remainingTokens: toNullableNumberHeader(headers.get('x-ratelimit-remaining-tokens')),
    limitRequests: toNullableNumberHeader(headers.get('x-ratelimit-limit-requests')),
    remainingRequests: toNullableNumberHeader(headers.get('x-ratelimit-remaining-requests')),
    resetTokens: headers.get('x-ratelimit-reset-tokens'),
    resetRequests: headers.get('x-ratelimit-reset-requests'),
    retryAfter: headers.get('retry-after'),
  }
}

function toNullableNumberHeader(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function converterToolsParaAnthropic(tools: typeof TOOL_DEFINITIONS) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }))
}

function converterToolsParaGemini(tools: typeof TOOL_DEFINITIONS) {
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: removerAdditionalPropertiesDoSchema(tool.function.parameters),
    })),
  }]
}

function converterToolsParaCerebras(tools: typeof TOOL_DEFINITIONS) {
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: enforceStrictSchema(tool.function.parameters),
      strict: true,
    },
  }))
}

function converterConversationParaCerebras(conversation: Array<ConversationMessage>, modelId: string): Array<Record<string, unknown>> {
  return conversation.map((item) => {
    if (item.role === 'assistant' && item.tool_calls?.length && modelId === 'llama-3.3-70b') {
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

function converterConteudoParaAnthropic(content: string | MessagePart[] | null): Array<Record<string, unknown>> {
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

function converterConversationParaAnthropic(conversation: Array<ConversationMessage>): Array<Record<string, unknown>> {
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
        const content = converterConteudoParaAnthropic(item.content)
        for (const toolCall of item.tool_calls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: safeJsonParse(toolCall.function.arguments, {}),
          })
        }
        return {
          role: 'assistant',
          content,
        }
      }

      return {
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: converterConteudoParaAnthropic(item.content),
      }
    })
}

function converterParteParaGemini(part: MessagePart): Record<string, unknown> | null {
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

function converterConversationParaGemini(conversation: Array<ConversationMessage>): Array<Record<string, unknown>> {
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
                result: parseToolResult(String(item.content || '')),
              },
              ...(item.tool_call_id ? { id: item.tool_call_id } : {}),
            },
          }],
        }
      }

      const parts = Array.isArray(item.content)
        ? item.content.map(converterParteParaGemini).filter(Boolean)
        : String(item.content || '').trim()
          ? [{ text: String(item.content || '') }]
          : []

      if (item.role === 'assistant' && item.tool_calls?.length) {
        const toolParts = item.tool_calls.map((toolCall) => ({
          functionCall: {
            name: toolCall.function.name,
            args: safeJsonParse(toolCall.function.arguments, {}),
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

function extrairRespostaAnthropic(data: Record<string, unknown>) {
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

function extrairRespostaGemini(data: Record<string, unknown>) {
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

async function chamarModelo(
  modelo: ModeloConfig,
  conversation: Array<ConversationMessage>,
  tools: typeof TOOL_DEFINITIONS,
  apiKeys: Record<string, string> | undefined,
  sendEvent: (type: string, data: Record<string, unknown>) => void = () => {},
  auditState?: AuditState,
  contextoExecucao?: { loopCount: number, conversationId: string },
) {
  const apiKey = obterApiKey(modelo.provider, apiKeys)
  if (!apiKey) {
    throw new Error(`API key de ${modelo.provider} nao configurada`)
  }

  let tentativa = 0
  while (tentativa < MAX_LLM_ATTEMPTS) {
    tentativa += 1
    try {
      const callId = crypto.randomUUID()
      const startedAt = Date.now()
      const headers = criarHeadersProvider(modelo.provider, apiKey)
      const payload = construirPayloadProvider(modelo, conversation, tools)
      const contexto = diagnosticoContexto(conversation)
      const tokenBreakdown = calcularBreakdownTokens(conversation, tools)
      const diagnostico = {
        provider: modelo.provider,
        modelo: modelo.id,
        mensagens: contexto.mensagens,
        tokensEstimados: contexto.tokensEstimados,
        tamanhoContexto: contexto.tamanhoContexto,
        apiKeyPresente: Boolean(apiKey),
        authorizationHeaderPresente: Boolean(headers.Authorization || headers['x-api-key']),
      }
      if (auditState) {
        auditState.totalModelCalls += 1
        auditState.cumulativeEstimatedTokens += tokenBreakdown.totalTokens
        if (modelo.provider === 'groq') auditState.groqCalls += 1
      }
      console.info('[MORPHEUS][llm_diagnostic]', diagnostico)
      sendEvent('thinking', {
        content: `Diagnóstico temporário: provider=${modelo.provider}, modelo=${modelo.id}, mensagens=${contexto.mensagens}, tokens≈${contexto.tokensEstimados}, contexto=${contexto.tamanhoContexto} chars, apiKey=${diagnostico.apiKeyPresente ? 'ok' : 'ausente'}, authHeader=${diagnostico.authorizationHeaderPresente ? 'ok' : 'ausente'}`,
      })
      logStructuredAudit('model_call_start', {
        requestId: auditState?.requestId,
        conversationId: contextoExecucao?.conversationId,
        loopCount: contextoExecucao?.loopCount,
        provider: modelo.provider,
        model: modelo.id,
        callId,
        attempt: tentativa,
        messagesCount: contexto.mensagens,
        estimatedTokens: contexto.tokensEstimados,
        contextSizeChars: contexto.tamanhoContexto,
        ...tokenBreakdown,
      })

      const response = await fetch(obterUrlProvider(modelo.provider, modelo.id, apiKey), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        const mensagemErro = extrairMensagemErroProvider(modelo.provider, response.status, errorBody, modelo.id)
        const rateLimit = extrairRateLimitHeaders(response.headers)
        logStructuredAudit('model_call_error', {
          requestId: auditState?.requestId,
          conversationId: contextoExecucao?.conversationId,
          loopCount: contextoExecucao?.loopCount,
          provider: modelo.provider,
          model: modelo.id,
          callId,
          attempt: tentativa,
          status: response.status,
          estimatedTokens: tokenBreakdown.totalTokens,
          durationMs: Date.now() - startedAt,
          rateLimit,
          error: mensagemErro,
        })

        if (response.status === 429) {
          const retryAfterMs = extrairRetryAfterMs(response.headers.get('retry-after'))
          const retryAfterMensagem = retryAfterMs
            ? ` Aguarde cerca de ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s antes de tentar novamente.`
            : ''
          throw new Error(`${mensagemErro}${retryAfterMensagem}`)
        }

        if (!statusEhRetriavel(response.status) || tentativa >= MAX_LLM_ATTEMPTS) {
          throw new Error(mensagemErro)
        }

        await sleep(RETRY_DELAY * tentativa)
        continue
      }

      const data = await response.json()
      const usage = ((data as Record<string, unknown>)?.usage || {}) as Record<string, unknown>
      const rateLimit = extrairRateLimitHeaders(response.headers)
      logStructuredAudit('model_call_success', {
        requestId: auditState?.requestId,
        conversationId: contextoExecucao?.conversationId,
        loopCount: contextoExecucao?.loopCount,
        provider: modelo.provider,
        model: modelo.id,
        callId,
        attempt: tentativa,
        estimatedTokens: tokenBreakdown.totalTokens,
        durationMs: Date.now() - startedAt,
        promptTokens: Number(usage.prompt_tokens || 0),
        completionTokens: Number(usage.completion_tokens || 0),
        totalTokens: Number(usage.total_tokens || 0),
        rateLimit,
      })

      if (modelo.provider === 'anthropic') {
        return extrairRespostaAnthropic(data as Record<string, unknown>)
      }

      if (modelo.provider === 'google') {
        return extrairRespostaGemini(data as Record<string, unknown>)
      }

      return data
    } catch (error) {
      if (tentativa >= MAX_LLM_ATTEMPTS) throw error
      await sleep(RETRY_DELAY * tentativa)
    }
  }

  throw new Error(`Nao foi possivel obter resposta do modelo ${modelo.id}`)
}

async function chamarComFallback(
  modeloInicial: ModeloConfig,
  conversation: Array<ConversationMessage>,
  tools: typeof TOOL_DEFINITIONS,
  apiKeys: Record<string, string> | undefined,
  sendEvent: (type: string, data: Record<string, unknown>) => void,
  providerOrder: string[],
  usarSomenteModeloInicial = false,
  auditState?: AuditState,
  contextoExecucao?: { loopCount: number, conversationId: string },
) {
  const cadeia = usarSomenteModeloInicial
    ? [modeloInicial]
    : [modeloInicial, ...cadeiaDeFallback(modeloInicial.id, providerOrder)]

  let ultimoErro: unknown = null
  logStructuredAudit('fallback_chain_start', {
    requestId: auditState?.requestId,
    conversationId: contextoExecucao?.conversationId,
    loopCount: contextoExecucao?.loopCount,
    initialModel: modeloInicial.id,
    providerOrder,
    candidateModels: cadeia.map((modelo) => modelo.id),
  })
  for (const modelo of cadeia) {
    try {
      sendEvent('thinking', { content: `Modelo selecionado: ${modelo.id}` })
      logStructuredAudit('fallback_attempt', {
        requestId: auditState?.requestId,
        conversationId: contextoExecucao?.conversationId,
        loopCount: contextoExecucao?.loopCount,
        provider: modelo.provider,
        model: modelo.id,
      })
      const data = await chamarModelo(modelo, conversation, tools, apiKeys, sendEvent, auditState, contextoExecucao)
      return { data, modelo }
    } catch (error) {
      ultimoErro = error
      sendEvent('thinking', { content: `Modelo ${modelo.id} falhou, tentando fallback...` })
      logStructuredAudit('fallback_attempt_failed', {
        requestId: auditState?.requestId,
        conversationId: contextoExecucao?.conversationId,
        loopCount: contextoExecucao?.loopCount,
        provider: modelo.provider,
        model: modelo.id,
        error: serializarErro(error),
      })
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error('Todos os modelos falharam')
}

async function registrarLogAcao(payload: Record<string, unknown>) {
  if (!supabaseAdmin) return

  try {
    await supabaseAdmin.from('morpheus_logs').insert(payload)
  } catch {
    // tabela pode não existir no ambiente atual; mantemos silencioso
  }
}

async function githubRequest(path: string, init: RequestInit, token: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const text = await response.text()
  const data = safeJsonParse(text, { raw: text })

  if (!response.ok) {
    throw new Error(typeof data === 'object' && data && 'message' in data ? String(data.message) : `GitHub HTTP ${response.status}`)
  }

  return data
}

async function executarToolComCircuito(nomeTool: string, executor: () => Promise<string>) {
  podeExecutar(nomeTool)

  try {
    const resultado = await executor()
    registrarSucesso(nomeTool)
    return resultado
  } catch (error) {
    registrarFalha(nomeTool)
    throw error
  }
}

export type ChatRequestPayload = {
  messages?: Array<{ role: string, content: string | MessagePart[] | null }>
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

export async function processarPipelineChat(
  payload: ChatRequestPayload,
  sendEvent: (type: string, data: Record<string, unknown>) => void = () => {},
): Promise<ChatExecutionResult> {
  const { messages, apiKeys, model, conversationId, providerOrder: providerOrderBody, systemPrompt, auditContext } = payload
  if (!messages?.length) {
    throw new Error('messages required')
  }

  const mensagensNormalizadas = normalizarMensagensEntrada(messages)
  const ultimaMensagem = ultimaMensagemTexto(mensagensNormalizadas)
  const effortLevel = selectEffortLevel(ultimaMensagem)
  const tipoTarefa = inferirTipoTarefa(ultimaMensagem)
  const providerOrder = extrairProviderOrderDisponivel(apiKeys, providerOrderBody)
  const modeloInicial = obterModeloInicial(model, tipoTarefa, providerOrder)
  const modeloFoiSelecionado = Boolean(model && model !== 'auto')
  const resolvedConversationId = conversationId || crypto.randomUUID()
  const requestId = crypto.randomUUID()
  const pipelineStartedAt = Date.now()
  const planner = new PlannerEngine(resolvedConversationId)
  const reflector = new ReflectorEngine()
  const repeticoesTool = new Map<string, number>()
  const auditState: AuditState = {
    requestId,
    conversationId: resolvedConversationId,
    totalModelCalls: 0,
    groqCalls: 0,
    totalToolCalls: 0,
    cumulativeEstimatedTokens: 0,
    executedTools: [],
    loopTransitions: [],
  }
  const githubResolverDefaults = {
    token: apiKeys?.github || process.env.GITHUB_TOKEN || '',
    defaultOwner: GITHUB_DEFAULT_OWNER,
    defaultRepository: GITHUB_DEFAULT_REPOSITORY,
    userIntent: ultimaMensagem,
  }

  const contextoSistema = compactarTexto([
    montarPrompt('planejamento', `Tipo de tarefa: ${tipoTarefa}\nSe o modelo atual não suportar tools ou visão para concluir a tarefa, explique isso claramente e sugira um modelo compatível.`),
    systemPrompt ? `--- CONTEXTO DO APP ---\n${systemPrompt}` : '',
  ].filter(Boolean).join('\n\n'), MAX_SYSTEM_PROMPT_CHARS)
  let conversation: Array<ConversationMessage> = [
    { role: 'system', content: contextoSistema },
    ...mensagensNormalizadas,
  ]
  let loopCount = 0
  let totalTokensUsed = 0
  let finalContent = ''
  let modeloUsado = modeloInicial?.id || 'none'
  logStructuredAudit('pipeline_start', {
    requestId,
    conversationId: resolvedConversationId,
    modelRequested: model || 'auto',
    initialModel: modeloInicial?.id || null,
    providerOrder,
    messagesCount: mensagensNormalizadas.length,
    estimatedTokens: diagnosticoContexto(conversation).tokensEstimados,
    memoryCount: Number(auditContext?.memoryCount || 0),
    memoryTokens: Number(auditContext?.memoryTokens || 0),
  })

  try {
    if (!modeloInicial) {
      throw new Error('Nenhum LLM configurado. Adicione uma API key compatível em Integracoes.')
    }

    if (mensagensContemImagem(mensagensNormalizadas) && !modeloInicial.suportaVisao) {
      throw new Error(montarMensagemLimitacao('visao', modeloInicial))
    }

    if (tarefaProvavelmenteExigeTools(ultimaMensagem) && !modeloInicial.suportaTools) {
      throw new Error(montarMensagemLimitacao('tools', modeloInicial, ultimaMensagem))
    }

    sendEvent('plan', {
      steps: [
        { id: 'analyze', label: 'Analisando prompt', status: 'pending' },
        { id: 'plan', label: 'Planejando acoes', status: 'pending' },
        { id: 'execute', label: 'Executando ferramentas', status: 'pending' },
        { id: 'synthesize', label: 'Sintetizando resposta', status: 'pending' },
      ],
      effortLevel,
    })

    while (loopCount < MAX_LOOPS) {
      loopCount += 1
      const compactacao = compactHistoryWithMeta(conversation)
      conversation = compactacao.conversation
      const contextoAtual = diagnosticoContexto(conversation)
      logStructuredAudit('loop_start', {
        requestId,
        conversationId: resolvedConversationId,
        loopCount,
        messagesCount: contextoAtual.mensagens,
        estimatedTokens: contextoAtual.tokensEstimados,
        contextSizeChars: contextoAtual.tamanhoContexto,
        compacted: compactacao.compacted,
        removedMessages: compactacao.removedMessages,
        currentModel: modeloUsado,
      })
      sendEvent('plan_update', {
        step: loopCount === 1 ? 'analyze' : loopCount === 2 ? 'plan' : loopCount === 3 ? 'execute' : 'synthesize',
        status: 'running',
      })
      sendEvent('thinking', {
        content: `Contexto preparado: ${contextoAtual.mensagens} mensagens, ${contextoAtual.tamanhoContexto} chars, tokens≈${contextoAtual.tokensEstimados}`,
      })

      const llmResult = await chamarComFallback(
        modeloInicial,
        conversation,
        TOOL_DEFINITIONS,
        apiKeys,
        sendEvent,
        providerOrder,
        modeloFoiSelecionado,
        auditState,
        { loopCount, conversationId: resolvedConversationId },
      )
      const llmData = llmResult.data
      modeloUsado = llmResult.modelo.id

      totalTokensUsed += (llmData as { usage?: { total_tokens?: number } }).usage?.total_tokens || 0
      if (totalTokensUsed > MAX_BUDGET_TOKENS) {
        sendEvent('thinking', { content: 'Limite de tokens atingido. Compactando contexto...' })
        conversation = compactHistory(conversation)
        totalTokensUsed = 0
      }

      const choice = (llmData as { choices?: Array<{ finish_reason?: string, message?: Record<string, unknown> }> }).choices?.[0]
      if (!choice?.message) {
        throw new Error('Nenhuma resposta valida do LLM')
      }

      const toolCalls = choice.message.tool_calls as Array<{ id: string, function: { name: string, arguments: string } }> | undefined
      if (choice.finish_reason === 'tool_calls' && toolCalls?.length) {
        auditState.loopTransitions.push({
          fromLoop: loopCount,
          toLoop: loopCount + 1,
          reason: 'tool_call_detectada',
          tools: toolCalls.map((toolCall) => toolCall.function.name),
        })
        logStructuredAudit('loop_transition', {
          requestId,
          conversationId: resolvedConversationId,
          fromLoop: loopCount,
          toLoop: loopCount + 1,
          reason: 'tool_call_detectada',
          tools: toolCalls.map((toolCall) => toolCall.function.name),
        })
        const blocosLeitura = toolCalls.filter((toolCall) => READ_ONLY_TOOLS.includes(toolCall.function.name))
        const blocosEscrita = toolCalls.filter((toolCall) => !READ_ONLY_TOOLS.includes(toolCall.function.name))

        const executarTool = async (toolCall: { id: string, function: { name: string, arguments: string } }) => {
          const inicioExecucao = Date.now()
          const args = safeJsonParse(toolCall.function.arguments, {})
          const assinaturaTool = `${toolCall.function.name}:${JSON.stringify(args)}`
          const repeticoes = (repeticoesTool.get(assinaturaTool) || 0) + 1
          repeticoesTool.set(assinaturaTool, repeticoes)
          if (repeticoes > MAX_REPEATED_TOOL_CALLS) {
            throw new Error(`Loop interno detectado: tool ${toolCall.function.name} repetida ${repeticoes}x com os mesmos argumentos`)
          }
          logStructuredAudit('tool_call_start', {
            requestId,
            conversationId: resolvedConversationId,
            loopCount,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            toolArguments: compactarTexto(JSON.stringify(args), 800),
            messagesCount: conversation.length,
            estimatedTokens: diagnosticoContexto(conversation).tokensEstimados,
          })
          sendEvent('tool_call', { id: toolCall.id, name: toolCall.function.name, arguments: args })

          try {
            const resultado = await executarToolComCircuito(toolCall.function.name, async () => {
              switch (toolCall.function.name) {
                case 'github_verify_connection': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const verification = await verifyGithubConnection(
                    githubResolverDefaults.token,
                    githubResolverDefaults.defaultOwner,
                    githubResolverDefaults.defaultRepository,
                  )
                  githubDiagnosticsStore.recordMany(verification.diagnostics)
                  return JSON.stringify(verification)
                }
                case 'github_list_repositories':
                case 'github_list_repos': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const repositories = await listGithubRepositories(githubResolverDefaults.token)
                  return JSON.stringify(repositories.map((repository) => ({
                    owner: repository.owner?.login || repository.full_name.split('/')[0] || GITHUB_DEFAULT_OWNER,
                    repo: repository.name,
                    full_name: repository.full_name,
                    default_branch: repository.default_branch,
                    private: Boolean(repository.private),
                    description: repository.description || null,
                  })))
                }
                case 'github_resolve_repository': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const resolved = await resolveGithubRepository({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    userIntent: String((args as Record<string, unknown>).contexto || githubResolverDefaults.userIntent || ''),
                  })
                  githubDiagnosticsStore.recordMany(resolved.diagnostics)
                  return JSON.stringify({
                    owner: resolved.owner,
                    repo: resolved.repo,
                    confidence: resolved.confidence,
                    defaultBranch: resolved.defaultBranch,
                    resolvedRepository: resolved.resolvedRepository,
                  })
                }
                case 'github_read_file': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const path = String((args as Record<string, unknown>).path || '')
                  if (!path) throw new Error('path e obrigatorio')
                  const context = await resolveGithubContext({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    requestedBranch: String((args as Record<string, unknown>).branch || ''),
                    requestedPath: path,
                    requirePath: true,
                  })
                  const data = await getGithubContent(context, githubResolverDefaults.token) as { content?: string, sha?: string, size?: number }
                  const content = data.content ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8') : ''
                  githubDiagnosticsStore.recordMany(context.diagnostics)
                  return JSON.stringify({
                    repo: context.repo,
                    owner: context.owner,
                    path: context.path,
                    branch: context.branch,
                    content,
                    sha: data.sha,
                    size: data.size,
                    diagnostics: context.diagnostics,
                  })
                }
                case 'github_list_files': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const context = await resolveGithubContext({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    requestedBranch: String((args as Record<string, unknown>).branch || ''),
                    requestedPath: String((args as Record<string, unknown>).path || ''),
                    requirePath: false,
                  })
                  const data = await getGithubContent(context, githubResolverDefaults.token)
                  githubDiagnosticsStore.recordMany(context.diagnostics)
                  return JSON.stringify({
                    owner: context.owner,
                    repo: context.repo,
                    branch: context.branch,
                    path: context.path,
                    data,
                    diagnostics: context.diagnostics,
                  })
                }
                case 'github_commit_file': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')

                  const path = String((args as Record<string, unknown>).path || '')
                  const content = String((args as Record<string, unknown>).content || '')
                  const message = String((args as Record<string, unknown>).message || '')
                  const branchInformada = String((args as Record<string, unknown>).branch || '')

                  if (!path || !content || !message) {
                    throw new Error('path, content e message sao obrigatorios')
                  }

                  const context = await resolveGithubContext({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    requestedBranch: branchInformada,
                    requestedPath: path,
                    requirePath: false,
                  })

                  const branchBase = context.defaultBranch
                  const usarFluxoSeguro = !branchInformada || branchProtegida(branchInformada)
                  const branch = usarFluxoSeguro ? gerarBranchAutonomo('patch') : context.branch

                  let sha: string | undefined
                  try {
                    sha = await getGithubFileSha(context, githubResolverDefaults.token)
                  } catch (error) {
                    if (!(error instanceof GithubResolverError) || error.status !== 404) {
                      throw error
                    }
                  }

                  if (usarFluxoSeguro) {
                    await createGithubBranchFromBase(githubResolverDefaults.token, context, branch, branchBase)
                  }

                  const data = await putGithubFile(
                    githubResolverDefaults.token,
                    context,
                    content,
                    message,
                    branch,
                    sha,
                  )

                  let prUrl: string | undefined
                  let prNumber: number | undefined
                  if (usarFluxoSeguro) {
                    const pr = await createGithubPullRequest(
                      githubResolverDefaults.token,
                      context,
                      message,
                      `Alteração autônoma criada pelo Morpheus para \`${context.path}\`.\n\nFluxo seguro: branch temporária + PR.`,
                      branch,
                      branchBase,
                    )
                    prUrl = pr.html_url
                    prNumber = pr.number
                  }

                  githubDiagnosticsStore.recordMany(context.diagnostics)

                  await reflector.refletir({
                    acao: `commit no arquivo ${context.path} do repositório ${context.repo}`,
                    resultado: prUrl || data.commit?.html_url || data.content?.html_url || `Commit realizado em ${context.owner}/${context.repo}`,
                    sucesso: true,
                    melhorias: usarFluxoSeguro ? ['Revisar o PR antes do merge em produção'] : [],
                  })

                  return JSON.stringify({
                    ...resumirExecucaoAutonoma({
                      objetivo: `Atualizar ${context.path}`,
                      branch,
                      repo: context.repo,
                      prUrl: prUrl || null,
                    }),
                    repo: context.repo,
                    owner: context.owner,
                    path: context.path,
                    branch,
                    baseBranch: branchBase,
                    modo: usarFluxoSeguro ? 'branch_temporaria_pr' : 'commit_direto',
                    commitSha: data.commit?.sha,
                    commitUrl: data.commit?.html_url || data.content?.html_url,
                    prUrl,
                    prNumber,
                    diagnostics: context.diagnostics,
                  })
                }
                case 'github_create_branch': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const branch = String((args as Record<string, unknown>).branch || '')
                  const from = String((args as Record<string, unknown>).from || '')
                  if (!branch) throw new Error('branch e obrigatoria')

                  const context = await resolveGithubContext({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    requestedBranch: from,
                  })

                  const data = await createGithubBranchFromBase(
                    githubResolverDefaults.token,
                    context,
                    branch,
                    from || context.defaultBranch,
                  )
                  githubDiagnosticsStore.recordMany(context.diagnostics)
                  return JSON.stringify({
                    owner: context.owner,
                    repo: context.repo,
                    branch,
                    baseBranch: from || context.defaultBranch,
                    data,
                    diagnostics: context.diagnostics,
                  })
                }
                case 'github_create_pr': {
                  if (!githubResolverDefaults.token) throw new Error('GITHUB_TOKEN nao configurado')
                  const title = String((args as Record<string, unknown>).title || '')
                  const body = String((args as Record<string, unknown>).body || '')
                  const head = String((args as Record<string, unknown>).head || '')
                  const base = String((args as Record<string, unknown>).base || '')
                  if (!title || !head) throw new Error('title e head sao obrigatorios')

                  const context = await resolveGithubContext({
                    ...githubResolverDefaults,
                    requestedRepository: String(
                      (args as Record<string, unknown>).repository
                      || (args as Record<string, unknown>).repo
                      || '',
                    ),
                    requestedOwner: String((args as Record<string, unknown>).owner || ''),
                    requestedBranch: base,
                  })

                  const data = await createGithubPullRequest(
                    githubResolverDefaults.token,
                    context,
                    title,
                    body,
                    head,
                    context.branch,
                  )
                  githubDiagnosticsStore.recordMany(context.diagnostics)
                  return JSON.stringify({
                    owner: context.owner,
                    repo: context.repo,
                    head,
                    base: context.branch,
                    data,
                    diagnostics: context.diagnostics,
                  })
                }
                case 'supabase_query': {
                  const supabase = obterSupabaseAdmin()
                  const table = String((args as Record<string, unknown>).table || '')
                  const columns = String((args as Record<string, unknown>).columns || '*')
                  const limit = Number((args as Record<string, unknown>).limit || 50)
                  const filter = parseJsonStringArgument<Record<string, string | number | boolean>>(
                    (args as Record<string, unknown>).filter,
                    'filter',
                    {},
                  )
                  if (!table) throw new Error('table e obrigatoria')

                  let query = supabase.from(table).select(columns).limit(Math.min(limit, 1000))
                  for (const [key, value] of Object.entries(filter)) {
                    query = query.eq(key, value)
                  }

                  const { data, error } = await query
                  if (error) throw new Error(error.message)
                  return JSON.stringify(data || [])
                }
                case 'supabase_upsert': {
                  const supabase = obterSupabaseAdmin()
                  const table = String((args as Record<string, unknown>).table || '')
                  const data = parseJsonStringArgument<Record<string, unknown> | Array<Record<string, unknown>>>(
                    (args as Record<string, unknown>).data,
                    'data',
                  )
                  if (!table || !data) throw new Error('table e data sao obrigatorios')
                  const payload = Array.isArray(data) ? data : [data]
                  const { data: upserted, error } = await supabase.from(table).upsert(payload).select()
                  if (error) throw new Error(error.message)
                  return JSON.stringify(upserted || [])
                }
                case 'web_search': {
                  const query = String((args as Record<string, unknown>).query || '')
                  const limit = Number((args as Record<string, unknown>).limit || 5)
                  if (query.length < 3) throw new Error('query deve ter ao menos 3 caracteres')
                  const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`)
                  const data = await response.json() as { RelatedTopics?: Array<{ Text?: string, FirstURL?: string }> }
                  const resultados = (data.RelatedTopics || []).slice(0, limit).map((item) => ({
                    title: item.Text?.split(' - ')[0] || item.Text || '',
                    snippet: item.Text || '',
                    url: item.FirstURL || '',
                  }))
                  return JSON.stringify(resultados)
                }
                case 'create_plan': {
                  const objetivo = String((args as Record<string, unknown>).objetivo || '')
                  const etapas = Array.isArray((args as Record<string, unknown>).etapas) ? (args as Record<string, unknown>).etapas as string[] : []
                  const criterioSucesso = String((args as Record<string, unknown>).criterio_sucesso || '')
                  const plano = await planner.criarPlano({ objetivo, etapas, criterioSucesso })
                  return JSON.stringify(plano)
                }
                case 'update_plan': {
                  const idEtapa = Number((args as Record<string, unknown>).id_etapa)
                  const status = String((args as Record<string, unknown>).status || '') as 'em_progresso' | 'concluida' | 'falhou' | 'ignorada'
                  const resultado = String((args as Record<string, unknown>).resultado || '')
                  const plano = await planner.atualizarEtapa(idEtapa, { status, resultado })
                  return JSON.stringify(plano)
                }
                case 'get_plan': {
                  return JSON.stringify(planner.planoAtual || null)
                }
                case 'self_reflect': {
                  const reflexao = await reflector.refletir({
                    acao: String((args as Record<string, unknown>).acao || ''),
                    resultado: String((args as Record<string, unknown>).resultado || ''),
                    sucesso: Boolean((args as Record<string, unknown>).sucesso),
                    melhorias: Array.isArray((args as Record<string, unknown>).melhorias) ? (args as Record<string, unknown>).melhorias as string[] : [],
                    licao: String((args as Record<string, unknown>).licao || ''),
                  })
                  return JSON.stringify(reflexao)
                }
                default:
                  throw new Error(`Tool nao implementada: ${toolCall.function.name}`)
              }
            })
            const toolResultSize = String(resultado || '').length
            const resultTokens = estimarTokensTexto(String(resultado || ''))
            const executionMs = Date.now() - inicioExecucao
            auditState.totalToolCalls += 1
            auditState.executedTools.push({
              loopCount,
              toolName: toolCall.function.name,
              toolArguments: compactarTexto(JSON.stringify(args), 800),
              executionMs,
              toolResultSize,
              resultTokens,
            })

            sendEvent('tool_result', { id: toolCall.id, result: resultado.slice(0, 2000) })
            logStructuredAudit('tool_call_success', {
              requestId,
              conversationId: resolvedConversationId,
              loopCount,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              toolArguments: compactarTexto(JSON.stringify(args), 800),
              toolResultSize,
              resultTokens,
              executionMs,
            })
            await registrarLogAcao({
              tipo: 'tool_call',
              ferramenta: toolCall.function.name,
              status: 'success',
              conversation_id: planner.conversationId,
              detalhes: safeJsonParse(resultado, { result: resultado }),
              criado_em: new Date().toISOString(),
            })

            return { toolCall, resultado }
          } catch (error) {
            logStructuredAudit('tool_call_error', {
              requestId,
              conversationId: resolvedConversationId,
              loopCount,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              toolArguments: compactarTexto(JSON.stringify(args), 800),
              executionMs: Date.now() - inicioExecucao,
              error: serializarErro(error),
            })
            throw error
          }
        }

        const resultadosLeitura = await Promise.all(blocosLeitura.map(executarTool))
        const resultadosEscrita: Array<{ toolCall: { id: string, function: { name: string, arguments: string } }, resultado: string }> = []

        for (const toolCall of blocosEscrita) {
          try {
            resultadosEscrita.push(await executarTool(toolCall))
          } catch (error) {
            await reflector.refletir({
              acao: `execucao da tool ${toolCall.function.name}`,
              resultado: serializarErro(error),
              sucesso: false,
              melhorias: ['Verificar parâmetros e credenciais antes da próxima tentativa'],
              licao: 'Falhas de integração precisam ser tratadas antes de prosseguir.',
            })

            throw error
          }
        }

        conversation.push({ role: 'assistant', content: extrairTextoConteudo(choice.message.content), tool_calls: toolCalls })
        for (const { toolCall, resultado } of [...resultadosLeitura, ...resultadosEscrita]) {
          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: compactarTexto(resultado, MAX_TOOL_RESULT_CHARS),
          })
        }
        continue
      }

      finalContent = extrairTextoConteudo(choice.message.content)
      if (!llmResult.modelo.suportaTools && respostaPareceSimularTool(finalContent)) {
        throw new Error(montarMensagemLimitacao('tools', llmResult.modelo, ultimaMensagem))
      }
      logStructuredAudit('loop_completed_without_tool', {
        requestId,
        conversationId: resolvedConversationId,
        loopCount,
        finalModel: llmResult.modelo.id,
        finalContentSize: finalContent.length,
      })
      break
    }

    if (!finalContent && loopCount >= MAX_LOOPS) {
      finalContent = `[MORPHEUS] Limite de loops do agente atingido (${MAX_LOOPS}). Tente reformular a solicitação.`
    }

    if (planner.planoAtual && planner.planoAtual.status === 'ativo') {
      await planner.finalizarPlano(true)
    }

    sendEvent('content', { content: finalContent, model: modeloUsado, loops: loopCount, tokensUsed: totalTokensUsed })
    sendEvent('plan_update', { step: 'synthesize', status: 'done' })
    logStructuredAudit('pipeline_summary', {
      requestId,
      conversationId: resolvedConversationId,
      loops: loopCount,
      totalModelCalls: auditState.totalModelCalls,
      groqCalls: auditState.groqCalls,
      totalToolCalls: auditState.totalToolCalls,
      cumulativeEstimatedTokens: auditState.cumulativeEstimatedTokens,
      totalExecutionMs: Date.now() - pipelineStartedAt,
      toolsExecuted: auditState.executedTools,
      loopTransitions: auditState.loopTransitions,
      modelUsed: modeloUsado,
      usageTokensReportedByProvider: totalTokensUsed,
    })
    return {
      content: finalContent,
      model: modeloUsado,
      loops: loopCount,
      tokensUsed: totalTokensUsed,
    }
  } catch (error) {
    if (planner.planoAtual && planner.planoAtual.status === 'ativo') {
      await planner.finalizarPlano(false)
    }

    sendEvent('error', { message: serializarErro(error) })
    logStructuredAudit('pipeline_error', {
      requestId,
      conversationId: resolvedConversationId,
      loops: loopCount,
      totalModelCalls: auditState.totalModelCalls,
      groqCalls: auditState.groqCalls,
      totalToolCalls: auditState.totalToolCalls,
      cumulativeEstimatedTokens: auditState.cumulativeEstimatedTokens,
      totalExecutionMs: Date.now() - pipelineStartedAt,
      toolsExecuted: auditState.executedTools,
      loopTransitions: auditState.loopTransitions,
      error: serializarErro(error),
    })
    throw error
  }
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  const payload = req.body as ChatRequestPayload

  if (!payload.messages?.length) {
    return res.status(400).json({ error: 'messages required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const sendDone = () => res.write('event: done\ndata: {}\n\n')

  try {
    await processarPipelineChat(payload, sendEvent)
    sendDone()
    res.end()
  } catch {
    sendDone()
    res.end()
  }
})

export default router
