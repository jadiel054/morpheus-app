import { obterSupabaseAdmin } from '../lib/supabaseAdmin.js'

const TABELA_PLANOS = 'morpheus_plans'

type StatusEtapa = 'pendente' | 'em_progresso' | 'concluida' | 'falhou' | 'ignorada'

type EtapaPlano = {
  id: number
  descricao: string
  status: StatusEtapa
  resultado: string | null
  iniciada_em: string | null
  concluida_em: string | null
}

type Plano = {
  id: string
  conversation_id: string
  objetivo: string
  etapas: EtapaPlano[]
  criterio_sucesso: string
  status: 'ativo' | 'concluido' | 'falhou' | 'cancelado'
  criado_em: string
  atualizado_em: string
}

export class PlannerEngine {
  conversationId: string
  planoAtual: Plano | null

  constructor(conversationId: string) {
    this.conversationId = conversationId
    this.planoAtual = null
  }

  async criarPlano({ objetivo, etapas, criterioSucesso }: { objetivo: string, etapas: string[], criterioSucesso: string }) {
    const plano: Plano = {
      id: crypto.randomUUID(),
      conversation_id: this.conversationId,
      objetivo,
      etapas: etapas.map((etapa, indice) => ({
        id: indice + 1,
        descricao: etapa,
        status: 'pendente',
        resultado: null,
        iniciada_em: null,
        concluida_em: null,
      })),
      criterio_sucesso: criterioSucesso,
      status: 'ativo',
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    }

    this.planoAtual = plano

    try {
      const supabase = obterSupabaseAdmin()
      const { error } = await supabase.from(TABELA_PLANOS).insert(plano)
      if (error) console.error('[Planner] Falha ao salvar plano:', error.message)
    } catch (error) {
      console.warn('[Planner] Supabase indisponível para persistência:', error instanceof Error ? error.message : String(error))
    }

    return plano
  }

  async atualizarEtapa(idEtapa: number, { status, resultado }: { status: StatusEtapa, resultado?: string }) {
    if (!this.planoAtual) throw new Error('[Planner] Nenhum plano ativo.')

    const etapa = this.planoAtual.etapas.find((item) => item.id === idEtapa)
    if (!etapa) throw new Error(`[Planner] Etapa ${idEtapa} nao encontrada.`)

    etapa.status = status
    etapa.resultado = resultado || null

    if (status === 'em_progresso') etapa.iniciada_em = new Date().toISOString()
    if (['concluida', 'falhou', 'ignorada'].includes(status)) {
      etapa.concluida_em = new Date().toISOString()
    }

    this.planoAtual.atualizado_em = new Date().toISOString()

    try {
      const supabase = obterSupabaseAdmin()
      const { error } = await supabase
        .from(TABELA_PLANOS)
        .update({
          etapas: this.planoAtual.etapas,
          atualizado_em: this.planoAtual.atualizado_em,
        })
        .eq('id', this.planoAtual.id)

      if (error) console.error('[Planner] Falha ao atualizar etapa:', error.message)
    } catch (error) {
      console.warn('[Planner] Falha ao persistir atualização:', error instanceof Error ? error.message : String(error))
    }

    return this.planoAtual
  }

  async finalizarPlano(sucesso = true) {
    if (!this.planoAtual) return null

    this.planoAtual.status = sucesso ? 'concluido' : 'falhou'
    this.planoAtual.atualizado_em = new Date().toISOString()

    try {
      const supabase = obterSupabaseAdmin()
      const { error } = await supabase
        .from(TABELA_PLANOS)
        .update({
          status: this.planoAtual.status,
          atualizado_em: this.planoAtual.atualizado_em,
        })
        .eq('id', this.planoAtual.id)

      if (error) console.error('[Planner] Falha ao finalizar plano:', error.message)
    } catch (error) {
      console.warn('[Planner] Falha ao persistir finalização:', error instanceof Error ? error.message : String(error))
    }

    const plano = this.planoAtual
    this.planoAtual = null
    return plano
  }

  proximaEtapaPendente() {
    return this.planoAtual?.etapas.find((etapa) => etapa.status === 'pendente') || null
  }

  resumoPlano() {
    if (!this.planoAtual) return 'Nenhum plano ativo.'

    const total = this.planoAtual.etapas.length
    const concluidas = this.planoAtual.etapas.filter((etapa) => etapa.status === 'concluida').length
    const falhas = this.planoAtual.etapas.filter((etapa) => etapa.status === 'falhou').length
    const pendentes = this.planoAtual.etapas.filter((etapa) => etapa.status === 'pendente').length

    return `"${this.planoAtual.objetivo}" — ${concluidas}/${total} concluidas | ${falhas} falhas | ${pendentes} pendentes`
  }
}

export const TOOLS_PLANNER = [
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Cria um plano hierárquico antes de executar tarefas complexas.',
      parameters: {
        type: 'object',
        properties: {
          objetivo: { type: 'string', description: 'Objetivo principal' },
          etapas: { type: 'array', items: { type: 'string' }, description: 'Lista ordenada de etapas' },
          criterio_sucesso: { type: 'string', description: 'Como verificar que o objetivo foi atingido' },
        },
        required: ['objetivo', 'etapas', 'criterio_sucesso'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Atualiza uma etapa do plano ativo.',
      parameters: {
        type: 'object',
        properties: {
          id_etapa: { type: 'number' },
          status: { type: 'string', enum: ['em_progresso', 'concluida', 'falhou', 'ignorada'] },
          resultado: { type: 'string' },
        },
        required: ['id_etapa', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_plan',
      description: 'Retorna o plano atual.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
] as const
