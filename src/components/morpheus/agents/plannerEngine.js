import { supabase } from '../../../lib/supabaseClient.js'

const TABELA_PLANOS = 'morpheus_plans'

export class PlannerEngine {
  constructor(conversationId) {
    this.conversationId = conversationId
    this.planoAtual = null
  }

  async criarPlano({ objetivo, etapas, criterioSucesso }) {
    const plano = {
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

    const { error } = await supabase.from(TABELA_PLANOS).insert(plano)
    if (error) {
      console.error('[Planner] Falha ao salvar plano no Supabase:', error.message)
    }

    return plano
  }

  async atualizarEtapa(idEtapa, { status, resultado }) {
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

    const { error } = await supabase
      .from(TABELA_PLANOS)
      .update({
        etapas: this.planoAtual.etapas,
        atualizado_em: this.planoAtual.atualizado_em,
      })
      .eq('id', this.planoAtual.id)

    if (error) {
      console.error('[Planner] Falha ao atualizar etapa:', error.message)
    }

    return this.planoAtual
  }

  async finalizarPlano(sucesso = true) {
    if (!this.planoAtual) return null

    this.planoAtual.status = sucesso ? 'concluido' : 'falhou'
    this.planoAtual.atualizado_em = new Date().toISOString()

    const { error } = await supabase
      .from(TABELA_PLANOS)
      .update({
        status: this.planoAtual.status,
        atualizado_em: this.planoAtual.atualizado_em,
      })
      .eq('id', this.planoAtual.id)

    if (error) {
      console.error('[Planner] Falha ao finalizar plano:', error.message)
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
    name: 'create_plan',
    description: 'Cria um plano hierárquico antes de executar tarefas com 2 ou mais etapas.',
    parameters: {
      type: 'object',
      properties: {
        objetivo: { type: 'string', description: 'Objetivo principal a alcançar' },
        etapas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista ordenada de etapas',
        },
        criterio_sucesso: { type: 'string', description: 'Como verificar que o objetivo foi alcançado' },
      },
      required: ['objetivo', 'etapas', 'criterio_sucesso'],
    },
  },
  {
    name: 'update_plan',
    description: 'Atualiza o status de uma etapa do plano ativo.',
    parameters: {
      type: 'object',
      properties: {
        id_etapa: { type: 'number', description: 'Numero da etapa' },
        status: {
          type: 'string',
          enum: ['em_progresso', 'concluida', 'falhou', 'ignorada'],
          description: 'Novo status da etapa',
        },
        resultado: { type: 'string', description: 'Resultado ou observacao da etapa' },
      },
      required: ['id_etapa', 'status'],
    },
  },
  {
    name: 'get_plan',
    description: 'Retorna o plano atual com status de cada etapa.',
    parameters: { type: 'object', properties: {} },
  },
]
