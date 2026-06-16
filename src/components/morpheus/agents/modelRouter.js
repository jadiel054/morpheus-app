export const MODELOS = {
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
}

const MAPA_TAREFA_MODELO = {
  codigo: 'openrouter_qwen',
  debug: 'openrouter_deepseek',
  rapido: 'groq_llama',
  analise: 'groq_mixtral',
  multimodal: 'openrouter_gemini',
  padrao: 'groq_llama',
}

export function rotearModelo(tipoTarefa = 'padrao') {
  const chave = MAPA_TAREFA_MODELO[tipoTarefa] || MAPA_TAREFA_MODELO.padrao
  return MODELOS[chave]
}

export function melhorModeloComTools() {
  return Object.values(MODELOS)
    .filter((modelo) => modelo.suportaTools)
    .sort((a, b) => a.prioridade - b.prioridade)[0]
}

export function cadeiaDeFallback(idModeloAtual) {
  const modelos = Object.values(MODELOS).sort((a, b) => a.prioridade - b.prioridade)
  const indiceAtual = modelos.findIndex((modelo) => modelo.id === idModeloAtual)
  return indiceAtual >= 0 ? modelos.slice(indiceAtual + 1) : modelos
}
