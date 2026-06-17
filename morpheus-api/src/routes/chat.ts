import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import { PlannerEngine, TOOLS_PLANNER } from '../agents/plannerEngine.js'
import { ReflectorEngine, TOOL_REFLECTOR } from '../agents/reflectorEngine.js'
import { podeExecutar, registrarSucesso, registrarFalha } from '../lib/circuitBreaker.js'
import { montarPrompt } from '../lib/prompts.js'
import { MODELOS, rotearModelo, cadeiaDeFallback, resolverModelo } from '../agents/modelRouter.js'
import { obterSupabaseAdmin, supabaseAdmin } from '../lib/supabaseAdmin.js'
import { branchProtegida, gerarBranchAutonomo, resumirExecucaoAutonoma } from '../lib/autonomyPolicy.js'

const router = Router()

const MAX_LOOPS = 15
const RETRY_DELAY = 1000
const MAX_LLM_ATTEMPTS = 3
const MAX_BUDGET_TOKENS = 100_000
const GITHUB_DEFAULT_OWNER = process.env.GITHUB_OWNER || 'jadiel054'

const READ_ONLY_TOOLS = [
  'github_list_repos',
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
      description: 'Lista repositórios do GitHub autenticado.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Lê o conteúdo real de um arquivo do GitHub.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['repo', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_files',
      description: 'Lista arquivos de um caminho no repositório.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_commit_file',
      description: 'Cria ou atualiza um arquivo em um repositório do GitHub. Em autonomia, prefira branch temporária e PR.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          message: { type: 'string' },
          branch: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['repo', 'path', 'content', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Cria uma nova branch para execução autônoma segura.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string' },
          from: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['repo', 'branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pr',
      description: 'Abre pull request com mudanças feitas em branch temporária.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['repo', 'title', 'head'],
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
          filter: { type: 'object', additionalProperties: true },
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
          data: { type: 'object', additionalProperties: true },
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

function safeJsonParse<T = Record<string, unknown>>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function compactHistory(history: Array<Record<string, unknown>>) {
  const systemMessages = history.filter((item) => item.role === 'system')
  const recentMessages = history.filter((item) => item.role !== 'system').slice(-20)
  return [...systemMessages, ...recentMessages]
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

function obterModeloInicial(model: string | undefined, tipoTarefa: string) {
  if (model && model !== 'auto') {
    const personalizado = resolverModelo(model)
    if (personalizado) return personalizado
    return { ...rotearModelo(tipoTarefa), id: model }
  }

  return rotearModelo(tipoTarefa)
}

function obterApiKey(provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google', apiKeys: Record<string, string> | undefined) {
  if (provider === 'groq') return apiKeys?.groq || process.env.GROQ_API_KEY || ''
  if (provider === 'openrouter') return apiKeys?.openrouter || process.env.OPENROUTER_API_KEY || ''
  if (provider === 'anthropic') return apiKeys?.anthropic || apiKeys?.claude || process.env.CLAUDE_API_KEY || ''
  if (provider === 'openai') return apiKeys?.openai || process.env.OPENAI_API_KEY || ''
  return apiKeys?.google || apiKeys?.gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function obterUrlProvider(provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google', modelId: string, apiKey: string) {
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions'
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions'
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages'
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions'
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`
}

function criarHeadersProvider(provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google', apiKey: string) {
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

function serializarErro(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function chamarModelo(
  modelo: { id: string, provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google', suportaTools: boolean, temperatura: number, maxTokens: number },
  conversation: Array<Record<string, unknown>>,
  tools: typeof TOOL_DEFINITIONS,
  apiKeys: Record<string, string> | undefined,
) {
  const apiKey = obterApiKey(modelo.provider, apiKeys)
  if (!apiKey) {
    throw new Error(`API key de ${modelo.provider} nao configurada`)
  }

  let tentativa = 0
  while (tentativa < MAX_LLM_ATTEMPTS) {
    tentativa += 1
    try {
      const response = await fetch(obterUrlProvider(modelo.provider, modelo.id, apiKey), {
        method: 'POST',
        headers: criarHeadersProvider(modelo.provider, apiKey),
        body: JSON.stringify(
          modelo.provider === 'anthropic'
            ? {
                model: modelo.id,
                max_tokens: Math.min(modelo.maxTokens, 4096),
                system: String(conversation.find((item) => item.role === 'system')?.content || ''),
                messages: conversation
                  .filter((item) => item.role !== 'system')
                  .map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.content })),
              }
            : modelo.provider === 'google'
              ? {
                  system_instruction: { parts: [{ text: String(conversation.find((item) => item.role === 'system')?.content || '') }] },
                  contents: conversation
                    .filter((item) => item.role !== 'system')
                    .map((item) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(item.content || '') }] })),
                }
              : {
                  model: modelo.id,
                  messages: conversation,
                  tools: modelo.suportaTools ? tools : undefined,
                  tool_choice: modelo.suportaTools ? 'auto' : undefined,
                  max_tokens: Math.min(modelo.maxTokens, 4096),
                  temperature: modelo.temperatura,
                },
        ),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        if (tentativa >= MAX_LLM_ATTEMPTS) {
          throw new Error(`Falha no modelo ${modelo.id}: ${errorBody}`)
        }

        await sleep(RETRY_DELAY * tentativa)
        continue
      }

      const data = await response.json()

      if (modelo.provider === 'anthropic') {
        return {
          choices: [{ finish_reason: 'stop', message: { content: data.content?.[0]?.text || '' } }],
          usage: { total_tokens: data.usage?.input_tokens ? data.usage.input_tokens + (data.usage?.output_tokens || 0) : 0 },
        }
      }

      if (modelo.provider === 'google') {
        return {
          choices: [{ finish_reason: 'stop', message: { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '' } }],
          usage: { total_tokens: data.usageMetadata?.totalTokenCount || 0 },
        }
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
  modeloInicial: { id: string, provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google', suportaTools: boolean, temperatura: number, maxTokens: number },
  conversation: Array<Record<string, unknown>>,
  tools: typeof TOOL_DEFINITIONS,
  apiKeys: Record<string, string> | undefined,
  sendEvent: (type: string, data: Record<string, unknown>) => void,
  usarSomenteModeloInicial = false,
) {
  const cadeia = usarSomenteModeloInicial
    ? [modeloInicial]
    : [modeloInicial, ...cadeiaDeFallback(modeloInicial.id)]

  let ultimoErro: unknown = null
  for (const modelo of cadeia) {
    try {
      sendEvent('thinking', { content: `Modelo selecionado: ${modelo.id}` })
      const data = await chamarModelo(modelo, conversation, tools, apiKeys)
      return { data, modelo }
    } catch (error) {
      ultimoErro = error
      sendEvent('thinking', { content: `Modelo ${modelo.id} falhou, tentando fallback...` })
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

router.post('/', authenticate, async (req: Request, res: Response) => {
  const { messages, apiKeys, model, conversationId } = req.body as {
    messages?: Array<{ role: string, content: string }>
    apiKeys?: Record<string, string>
    model?: string
    conversationId?: string
  }

  if (!messages?.length) {
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

  const ultimaMensagem = messages[messages.length - 1]?.content || ''
  const effortLevel = selectEffortLevel(ultimaMensagem)
  const tipoTarefa = inferirTipoTarefa(ultimaMensagem)
  const modeloInicial = obterModeloInicial(model, tipoTarefa)
  const modeloFoiSelecionado = Boolean(model && model !== 'auto')
  const planner = new PlannerEngine(conversationId || crypto.randomUUID())
  const reflector = new ReflectorEngine()

  const contextoSistema = montarPrompt('planejamento', `Tipo de tarefa: ${tipoTarefa}`)
  let conversation: Array<Record<string, unknown>> = [
    { role: 'system', content: contextoSistema },
    ...messages,
  ]
  let loopCount = 0
  let totalTokensUsed = 0
  let finalContent = ''
  let modeloUsado = modeloInicial.id

  try {
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
      sendEvent('plan_update', {
        step: loopCount === 1 ? 'analyze' : loopCount === 2 ? 'plan' : loopCount === 3 ? 'execute' : 'synthesize',
        status: 'running',
      })

      const llmResult = await chamarComFallback(modeloInicial, conversation, TOOL_DEFINITIONS, apiKeys, sendEvent, modeloFoiSelecionado)
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
        const blocosLeitura = toolCalls.filter((toolCall) => READ_ONLY_TOOLS.includes(toolCall.function.name))
        const blocosEscrita = toolCalls.filter((toolCall) => !READ_ONLY_TOOLS.includes(toolCall.function.name))

        const executarTool = async (toolCall: { id: string, function: { name: string, arguments: string } }) => {
          const args = safeJsonParse(toolCall.function.arguments, {})
          sendEvent('tool_call', { id: toolCall.id, name: toolCall.function.name, arguments: args })

          const resultado = await executarToolComCircuito(toolCall.function.name, async () => {
            switch (toolCall.function.name) {
              case 'github_list_repos': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')
                const data = await githubRequest('/user/repos?per_page=100&sort=updated', { method: 'GET' }, token)
                return JSON.stringify(data)
              }
              case 'github_read_file': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')
                const repo = String((args as Record<string, unknown>).repo || '')
                const path = String((args as Record<string, unknown>).path || '')
                const owner = String((args as Record<string, unknown>).owner || GITHUB_DEFAULT_OWNER)
                if (!repo || !path) throw new Error('repo e path sao obrigatorios')
                const data = await githubRequest(`/repos/${owner}/${repo}/contents/${path}`, { method: 'GET' }, token) as { content?: string, sha?: string, size?: number }
                const content = data.content ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8') : ''
                return JSON.stringify({ repo, owner, path, content, sha: data.sha, size: data.size })
              }
              case 'github_list_files': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')
                const repo = String((args as Record<string, unknown>).repo || '')
                const path = String((args as Record<string, unknown>).path || '')
                const owner = String((args as Record<string, unknown>).owner || GITHUB_DEFAULT_OWNER)
                if (!repo) throw new Error('repo e obrigatorio')
                const sufixo = path ? `/${path}` : ''
                const data = await githubRequest(`/repos/${owner}/${repo}/contents${sufixo}`, { method: 'GET' }, token)
                return JSON.stringify(data)
              }
              case 'github_commit_file': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')

                const repo = String((args as Record<string, unknown>).repo || '')
                const path = String((args as Record<string, unknown>).path || '')
                const content = String((args as Record<string, unknown>).content || '')
                const message = String((args as Record<string, unknown>).message || '')
                const branchInformada = String((args as Record<string, unknown>).branch || '')
                const owner = String((args as Record<string, unknown>).owner || GITHUB_DEFAULT_OWNER)

                if (!repo || !path || !content || !message) {
                  throw new Error('repo, path, content e message sao obrigatorios')
                }

                const branchBase = 'main'
                const usarFluxoSeguro = !branchInformada || branchProtegida(branchInformada)
                const branch = usarFluxoSeguro ? gerarBranchAutonomo('patch') : branchInformada

                let sha: string | undefined
                try {
                  const atual = await githubRequest(`/repos/${owner}/${repo}/contents/${path}`, { method: 'GET' }, token) as { sha?: string }
                  sha = atual.sha
                } catch {
                  sha = undefined
                }

                if (usarFluxoSeguro) {
                  const refBase = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${branchBase}`, { method: 'GET' }, token) as { object?: { sha?: string } }
                  const shaBase = refBase.object?.sha
                  if (!shaBase) throw new Error('Nao foi possivel obter a branch base para criar branch autonoma')

                  await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
                    method: 'POST',
                    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: shaBase }),
                  }, token)
                }

                const body = {
                  message,
                  content: Buffer.from(content, 'utf-8').toString('base64'),
                  branch,
                  ...(sha ? { sha } : {}),
                }

                const data = await githubRequest(`/repos/${owner}/${repo}/contents/${path}`, {
                  method: 'PUT',
                  body: JSON.stringify(body),
                }, token) as {
                  commit?: { sha?: string, html_url?: string }
                  content?: { html_url?: string }
                }

                let prUrl: string | undefined
                let prNumber: number | undefined
                if (usarFluxoSeguro) {
                  const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
                    method: 'POST',
                    body: JSON.stringify({
                      title: message,
                      body: `Alteração autônoma criada pelo Morpheus para \`${path}\`.\n\nFluxo seguro: branch temporária + PR.`,
                      head: branch,
                      base: branchBase,
                    }),
                  }, token) as { html_url?: string, number?: number }

                  prUrl = pr.html_url
                  prNumber = pr.number
                }

                await reflector.refletir({
                  acao: `commit no arquivo ${path} do repositório ${repo}`,
                  resultado: prUrl || data.commit?.html_url || data.content?.html_url || `Commit realizado em ${owner}/${repo}`,
                  sucesso: true,
                  melhorias: usarFluxoSeguro ? ['Revisar o PR antes do merge em produção'] : [],
                })

                return JSON.stringify({
                  ...resumirExecucaoAutonoma({
                    objetivo: `Atualizar ${path}`,
                    branch,
                    repo,
                    prUrl: prUrl || null,
                  }),
                  repo,
                  owner,
                  path,
                  branch,
                  baseBranch: branchBase,
                  modo: usarFluxoSeguro ? 'branch_temporaria_pr' : 'commit_direto',
                  commitSha: data.commit?.sha,
                  commitUrl: data.commit?.html_url || data.content?.html_url,
                  prUrl,
                  prNumber,
                })
              }
              case 'github_create_branch': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')
                const repo = String((args as Record<string, unknown>).repo || '')
                const branch = String((args as Record<string, unknown>).branch || '')
                const from = String((args as Record<string, unknown>).from || 'main')
                const owner = String((args as Record<string, unknown>).owner || GITHUB_DEFAULT_OWNER)
                if (!repo || !branch) throw new Error('repo e branch sao obrigatorios')

                const refBase = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${from}`, { method: 'GET' }, token) as { object?: { sha?: string } }
                const shaBase = refBase.object?.sha
                if (!shaBase) throw new Error('Nao foi possivel obter a branch base')

                const data = await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
                  method: 'POST',
                  body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: shaBase }),
                }, token)

                return JSON.stringify(data)
              }
              case 'github_create_pr': {
                const token = apiKeys?.github || process.env.GITHUB_TOKEN || ''
                if (!token) throw new Error('GITHUB_TOKEN nao configurado')
                const repo = String((args as Record<string, unknown>).repo || '')
                const title = String((args as Record<string, unknown>).title || '')
                const body = String((args as Record<string, unknown>).body || '')
                const head = String((args as Record<string, unknown>).head || '')
                const base = String((args as Record<string, unknown>).base || 'main')
                const owner = String((args as Record<string, unknown>).owner || GITHUB_DEFAULT_OWNER)
                if (!repo || !title || !head) throw new Error('repo, title e head sao obrigatorios')

                const data = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
                  method: 'POST',
                  body: JSON.stringify({ title, body, head, base }),
                }, token)

                return JSON.stringify(data)
              }
              case 'supabase_query': {
                const supabase = obterSupabaseAdmin()
                const table = String((args as Record<string, unknown>).table || '')
                const columns = String((args as Record<string, unknown>).columns || '*')
                const limit = Number((args as Record<string, unknown>).limit || 50)
                const filter = ((args as Record<string, unknown>).filter || {}) as Record<string, string | number | boolean>
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
                const data = (args as Record<string, unknown>).data
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

          sendEvent('tool_result', { id: toolCall.id, result: resultado.slice(0, 2000) })
          await registrarLogAcao({
            tipo: 'tool_call',
            ferramenta: toolCall.function.name,
            status: 'success',
            conversation_id: planner.conversationId,
            detalhes: safeJsonParse(resultado, { result: resultado }),
            criado_em: new Date().toISOString(),
          })

          return { toolCall, resultado }
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

        conversation.push({ role: 'assistant', content: null, tool_calls: toolCalls })
        for (const { toolCall, resultado } of [...resultadosLeitura, ...resultadosEscrita]) {
          conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: resultado })
        }
        continue
      }

      finalContent = String(choice.message.content || '')
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
    sendDone()
    res.end()
  } catch (error) {
    if (planner.planoAtual && planner.planoAtual.status === 'ativo') {
      await planner.finalizarPlano(false)
    }

    sendEvent('error', { message: serializarErro(error) })
    sendDone()
    res.end()
  }
})

export default router
