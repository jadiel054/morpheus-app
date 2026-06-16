import { supabase } from '../../../lib/supabaseClient.js'

export class ReflectorEngine {
  constructor() {
    this.reflexoes = []
  }

  async refletir({ acao, resultado, sucesso, melhorias = [], licao = null }) {
    const reflexao = {
      id: crypto.randomUUID(),
      acao,
      resultado,
      sucesso,
      melhorias,
      licao,
      timestamp: new Date().toISOString(),
    }

    this.reflexoes.push(reflexao)

    const { error } = await supabase.from('morpheus_reflections').insert(reflexao)
    if (error) {
      console.warn('[Reflector] Falha ao salvar reflexao:', error.message)
    }

    return reflexao
  }

  reflexoesRecentes(limite = 5) {
    return this.reflexoes.slice(-limite)
  }
}

export const TOOL_REFLECTOR = {
  name: 'self_reflect',
  description: 'Registra uma reflexao estruturada apos uma acao importante.',
  parameters: {
    type: 'object',
    properties: {
      acao: { type: 'string', description: 'O que foi feito' },
      resultado: { type: 'string', description: 'Resultado observado com evidência' },
      sucesso: { type: 'boolean', description: 'A ação atingiu o objetivo?' },
      melhorias: {
        type: 'array',
        items: { type: 'string' },
        description: 'O que fazer melhor nas próximas vezes',
      },
      licao: { type: 'string', description: 'Lição principal aprendida' },
    },
    required: ['acao', 'resultado', 'sucesso'],
  },
}
