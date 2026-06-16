import { obterSupabaseAdmin } from '../lib/supabaseAdmin.js'

type ReflexaoEntrada = {
  acao: string
  resultado: string
  sucesso: boolean
  melhorias?: string[]
  licao?: string | null
}

export class ReflectorEngine {
  reflexoes: Array<ReflexaoEntrada & { id: string, timestamp: string }>

  constructor() {
    this.reflexoes = []
  }

  async refletir({ acao, resultado, sucesso, melhorias = [], licao = null }: ReflexaoEntrada) {
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

    try {
      const supabase = obterSupabaseAdmin()
      const { error } = await supabase.from('morpheus_reflections').insert(reflexao)
      if (error) console.warn('[Reflector] Falha ao salvar reflexão:', error.message)
    } catch (error) {
      console.warn('[Reflector] Supabase indisponível para reflexão:', error instanceof Error ? error.message : String(error))
    }

    return reflexao
  }

  reflexoesRecentes(limite = 5) {
    return this.reflexoes.slice(-limite)
  }
}

export const TOOL_REFLECTOR = {
  type: 'function',
  function: {
    name: 'self_reflect',
    description: 'Registra uma reflexão estruturada após uma ação importante.',
    parameters: {
      type: 'object',
      properties: {
        acao: { type: 'string', description: 'O que foi feito' },
        resultado: { type: 'string', description: 'Resultado observado' },
        sucesso: { type: 'boolean', description: 'Se atingiu o objetivo' },
        melhorias: { type: 'array', items: { type: 'string' }, description: 'Melhorias futuras' },
        licao: { type: 'string', description: 'Lição aprendida' },
      },
      required: ['acao', 'resultado', 'sucesso'],
    },
  },
} as const
