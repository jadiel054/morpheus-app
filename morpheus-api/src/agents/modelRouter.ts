export type ModeloConfig = {
  id: string
  provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google'
  nome: string
  suportaTools: boolean
  suportaVisao: boolean
  temperatura: number
  maxTokens: number
  uso: string
}

export const MODELOS: Record<string, ModeloConfig> = {
  groq_llama: {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    nome: 'Groq Llama 3.3 70B',
    suportaTools: true,
    suportaVisao: false,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'velocidade, tarefas gerais, respostas rápidas',
  },
  groq_mixtral: {
    id: 'mixtral-8x7b-32768',
    provider: 'groq',
    nome: 'Groq Mixtral 8x7B',
    suportaTools: false,
    suportaVisao: false,
    temperatura: 0.4,
    maxTokens: 32768,
    uso: 'contexto longo, análise de arquivos grandes',
  },
  openrouter_qwen: {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    provider: 'openrouter',
    nome: 'Qwen Coder (OpenRouter)',
    suportaTools: true,
    suportaVisao: false,
    temperatura: 0.2,
    maxTokens: 8192,
    uso: 'codificação especializada, refatoração',
  },
  openrouter_deepseek: {
    id: 'deepseek/deepseek-r1',
    provider: 'openrouter',
    nome: 'DeepSeek R1 (OpenRouter)',
    suportaTools: true,
    suportaVisao: false,
    temperatura: 0.1,
    maxTokens: 8192,
    uso: 'raciocínio complexo, debugging difícil',
  },
  openrouter_gemini: {
    id: 'google/gemini-flash-1.5',
    provider: 'openrouter',
    nome: 'Gemini Flash 1.5 (OpenRouter)',
    suportaTools: true,
    suportaVisao: true,
    temperatura: 0.5,
    maxTokens: 8192,
    uso: 'análise multimodal',
  },
  openrouter_glm: {
    id: 'thudm/glm-4-9b',
    provider: 'openrouter',
    nome: 'GLM-4 9B (OpenRouter)',
    suportaTools: false,
    suportaVisao: false,
    temperatura: 0.3,
    maxTokens: 4096,
    uso: 'modelo alternativo OpenRouter',
  },
  anthropic_claude_sonnet: {
    id: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    nome: 'Claude Sonnet 4.5',
    suportaTools: true,
    suportaVisao: true,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'escrita, análise ampla e instruções complexas',
  },
  openai_gpt4o: {
    id: 'gpt-4o',
    provider: 'openai',
    nome: 'OpenAI GPT-4o',
    suportaTools: true,
    suportaVisao: true,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'tarefas gerais com OpenAI',
  },
  google_gemini_flash: {
    id: 'gemini-2.0-flash',
    provider: 'google',
    nome: 'Gemini 2.0 Flash',
    suportaTools: true,
    suportaVisao: true,
    temperatura: 0.4,
    maxTokens: 8192,
    uso: 'velocidade alta via Google Gemini',
  },
}

export const PROVIDER_DEFAULT_MODELS: Record<string, keyof typeof MODELOS> = {
  groq: 'groq_llama',
  openrouter: 'openrouter_qwen',
  anthropic: 'anthropic_claude_sonnet',
  openai: 'openai_gpt4o',
  google: 'google_gemini_flash',
}

const ALIAS_MODELOS: Record<string, string> = {
  groq_llama: 'groq_llama',
  groq_mixtral: 'groq_mixtral',
  openrouter_qwen: 'openrouter_qwen',
  openrouter_qwen_coder: 'openrouter_qwen',
  openrouter_deepseek: 'openrouter_deepseek',
  openrouter_glm: 'openrouter_glm',
  openrouter_gemini: 'openrouter_gemini',
  anthropic_claude_sonnet: 'anthropic_claude_sonnet',
  claude: 'anthropic_claude_sonnet',
  openai_gpt4o: 'openai_gpt4o',
  google_gemini_flash: 'google_gemini_flash',
}

const PROVIDER_ALIASES: Record<string, keyof typeof PROVIDER_DEFAULT_MODELS> = {
  groq: 'groq',
  groq_key: 'groq',
  groq_api_key: 'groq',
  openrouter: 'openrouter',
  openrouter_key: 'openrouter',
  openrouter_api_key: 'openrouter',
  claude: 'anthropic',
  claude_key: 'anthropic',
  claude_api_key: 'anthropic',
  anthropic: 'anthropic',
  anthropic_key: 'anthropic',
  anthropic_api_key: 'anthropic',
  openai: 'openai',
  openai_key: 'openai',
  openai_api_key: 'openai',
  gemini: 'google',
  gemini_key: 'google',
  gemini_api_key: 'google',
  google: 'google',
  google_api_key: 'google',
}

export function normalizarProvider(chave?: string | null) {
  if (!chave) return null
  return PROVIDER_ALIASES[String(chave).toLowerCase()] || null
}

export function extrairOrdemProviders(...sources: unknown[]) {
  const ordem: Array<keyof typeof PROVIDER_DEFAULT_MODELS> = []
  const vistos = new Set<string>()

  const adicionar = (valor: unknown) => {
    const provider = normalizarProvider(String(valor || ''))
    if (!provider || vistos.has(provider)) return
    vistos.add(provider)
    ordem.push(provider)
  }

  const visitar = (source: unknown) => {
    if (!source) return
    if (Array.isArray(source)) {
      source.forEach(visitar)
      return
    }
    if (typeof source === 'string') {
      adicionar(source)
      return
    }
    if (typeof source === 'object') {
      Object.keys(source as Record<string, unknown>).forEach(adicionar)
    }
  }

  sources.forEach(visitar)
  return ordem
}

export function resolverModelo(model?: string) {
  if (!model || model === 'auto') return null

  const alias = ALIAS_MODELOS[model]
  if (alias && MODELOS[alias]) return MODELOS[alias]

  const encontradoPorId = Object.values(MODELOS).find((item) => item.id === model)
  return encontradoPorId || null
}

export function modeloPadraoPorProvider(provider?: string | null) {
  const normalizado = normalizarProvider(provider)
  if (!normalizado) return null
  const chave = PROVIDER_DEFAULT_MODELS[normalizado]
  return chave ? MODELOS[chave] : null
}

export function resolverModeloAuto(providerOrder: unknown[] = []) {
  for (const provider of extrairOrdemProviders(providerOrder)) {
    const modelo = modeloPadraoPorProvider(provider)
    if (modelo) return modelo
  }
  return null
}

export function rotearModelo(_tipoTarefa = 'padrao', providerOrder: unknown[] = []) {
  return resolverModeloAuto(providerOrder)
}

export function melhorModeloComTools() {
  return Object.values(MODELOS)
    .filter((modelo) => modelo.suportaTools)
    [0]
}

export function modelosComCapacidade(capacidade: 'tools' | 'visao') {
  return Object.values(MODELOS)
    .filter((modelo) => capacidade === 'tools' ? modelo.suportaTools : modelo.suportaVisao)
}

export function cadeiaDeFallback(idModeloAtual: string, providerOrder: unknown[] = []) {
  const modeloAtual = Object.values(MODELOS).find((modelo) => modelo.id === idModeloAtual)
  return extrairOrdemProviders(providerOrder)
    .map((provider) => modeloPadraoPorProvider(provider))
    .filter((modelo): modelo is ModeloConfig => Boolean(modelo))
    .filter((modelo) => modelo.id !== idModeloAtual && modelo.provider !== modeloAtual?.provider)
}
