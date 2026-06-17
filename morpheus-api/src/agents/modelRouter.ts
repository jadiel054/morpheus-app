export type ModeloConfig = {
  id: string
  provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'google'
  suportaTools: boolean
  prioridade: number
  temperatura: number
  maxTokens: number
  uso: string
}

export const MODELOS: Record<string, ModeloConfig> = {
  groq_llama: {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    suportaTools: true,
    prioridade: 1,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'velocidade, tarefas gerais, respostas rápidas',
  },
  groq_mixtral: {
    id: 'mixtral-8x7b-32768',
    provider: 'groq',
    suportaTools: true,
    prioridade: 2,
    temperatura: 0.4,
    maxTokens: 32768,
    uso: 'contexto longo, análise de arquivos grandes',
  },
  openrouter_qwen: {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    provider: 'openrouter',
    suportaTools: true,
    prioridade: 3,
    temperatura: 0.2,
    maxTokens: 8192,
    uso: 'codificação especializada, refatoração',
  },
  openrouter_deepseek: {
    id: 'deepseek/deepseek-r1',
    provider: 'openrouter',
    suportaTools: false,
    prioridade: 4,
    temperatura: 0.1,
    maxTokens: 8192,
    uso: 'raciocínio complexo, debugging difícil',
  },
  openrouter_gemini: {
    id: 'google/gemini-flash-1.5',
    provider: 'openrouter',
    suportaTools: true,
    prioridade: 5,
    temperatura: 0.5,
    maxTokens: 8192,
    uso: 'análise multimodal',
  },
  openrouter_glm: {
    id: 'thudm/glm-4-9b',
    provider: 'openrouter',
    suportaTools: false,
    prioridade: 6,
    temperatura: 0.3,
    maxTokens: 4096,
    uso: 'fallback final',
  },
  anthropic_claude_sonnet: {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    suportaTools: false,
    prioridade: 7,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'escrita, análise ampla e instruções complexas',
  },
  openai_gpt4o: {
    id: 'gpt-4o-mini',
    provider: 'openai',
    suportaTools: false,
    prioridade: 8,
    temperatura: 0.3,
    maxTokens: 8192,
    uso: 'fallback OpenAI para tarefas gerais',
  },
  google_gemini_flash: {
    id: 'gemini-2.0-flash',
    provider: 'google',
    suportaTools: false,
    prioridade: 9,
    temperatura: 0.4,
    maxTokens: 8192,
    uso: 'velocidade alta via Google Gemini',
  },
}

const MAPA_TAREFA_MODELO: Record<string, string> = {
  codigo: 'openrouter_qwen',
  debug: 'openrouter_deepseek',
  rapido: 'groq_llama',
  analise: 'groq_mixtral',
  multimodal: 'openrouter_gemini',
  padrao: 'groq_llama',
}

const ALIAS_MODELOS: Record<string, string> = {
  auto: 'groq_llama',
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

export function rotearModelo(tipoTarefa = 'padrao') {
  const chave = MAPA_TAREFA_MODELO[tipoTarefa] || MAPA_TAREFA_MODELO.padrao
  return MODELOS[chave]
}

export function resolverModelo(model?: string) {
  if (!model) return null

  const alias = ALIAS_MODELOS[model]
  if (alias && MODELOS[alias]) return MODELOS[alias]

  const encontradoPorId = Object.values(MODELOS).find((item) => item.id === model)
  return encontradoPorId || null
}

export function melhorModeloComTools() {
  return Object.values(MODELOS)
    .filter((modelo) => modelo.suportaTools)
    .sort((a, b) => a.prioridade - b.prioridade)[0]
}

export function cadeiaDeFallback(idModeloAtual: string) {
  const modelos = Object.values(MODELOS).sort((a, b) => a.prioridade - b.prioridade)
  const indiceAtual = modelos.findIndex((modelo) => modelo.id === idModeloAtual)
  return indiceAtual >= 0 ? modelos.slice(indiceAtual + 1) : modelos
}
