export const MODELOS = {
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
  cerebras_llama: {
    id: 'gpt-oss-120b',
    provider: 'cerebras',
    nome: 'Cerebras Llama 3.3 70B',
    suportaTools: true,
    suportaVisao: false,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'alta velocidade via Cerebras com tool calling OpenAI-compatível',
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

export const PROVIDER_DEFAULT_MODELS = {
  groq: 'groq_llama',
  cerebras: 'cerebras_llama',
  openrouter: 'openrouter_qwen',
  anthropic: 'anthropic_claude_sonnet',
  openai: 'openai_gpt4o',
  google: 'google_gemini_flash',
}

const PROVIDER_ALIASES = {
  groq: 'groq',
  groq_key: 'groq',
  groq_api_key: 'groq',
  cerebras: 'cerebras',
  cerebras_key: 'cerebras',
  cerebras_api_key: 'cerebras',
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

const ALIAS_MODELOS = {
  groq_llama: 'groq_llama',
  groq_mixtral: 'groq_mixtral',
  cerebras_llama: 'cerebras_llama',
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

export function melhorModeloComTools() {
  return Object.values(MODELOS)
    .find((modelo) => modelo.suportaTools)
}

export function modelosComCapacidade(capacidade) {
  return Object.values(MODELOS)
    .filter((modelo) => capacidade === 'tools' ? modelo.suportaTools : modelo.suportaVisao)
}

export function normalizarProvider(chave) {
  if (!chave) return null
  return PROVIDER_ALIASES[String(chave).toLowerCase()] || null
}

export function extrairOrdemProviders(...sources) {
  const ordem = []
  const vistos = new Set()
  const adicionar = (valor) => {
    const provider = normalizarProvider(valor)
    if (!provider || vistos.has(provider)) return
    vistos.add(provider)
    ordem.push(provider)
  }

  const visitar = (source) => {
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
      Object.keys(source).forEach(adicionar)
    }
  }

  sources.forEach(visitar)
  return ordem
}

export function resolverModelo(model) {
  if (!model || model === 'auto') return null

  const alias = ALIAS_MODELOS[model]
  if (alias && MODELOS[alias]) return MODELOS[alias]

  return Object.values(MODELOS).find((item) => item.id === model) || null
}

export function modeloPadraoPorProvider(provider) {
  const normalizado = normalizarProvider(provider)
  if (!normalizado) return null
  const chave = PROVIDER_DEFAULT_MODELS[normalizado]
  return chave ? MODELOS[chave] : null
}

export function resolverModeloAuto(providerOrder = []) {
  for (const provider of extrairOrdemProviders(providerOrder)) {
    const modelo = modeloPadraoPorProvider(provider)
    if (modelo) return modelo
  }
  return null
}

export function rotearModelo(_tipoTarefa = 'padrao', providerOrder = []) {
  return resolverModeloAuto(providerOrder)
}

export function cadeiaDeFallback(idModeloAtual, providerOrder = []) {
  const modeloAtual = Object.values(MODELOS).find((modelo) => modelo.id === idModeloAtual)
  return extrairOrdemProviders(providerOrder)
    .map((provider) => modeloPadraoPorProvider(provider))
    .filter(Boolean)
    .filter((modelo) => modelo.id !== idModeloAtual && modelo.provider !== modeloAtual?.provider)
}
