// ============================================================================
// MORPHEUS - Supabase Tools
// Funções para operações do Supabase
// ============================================================================

import { podeExecutar, registrarSucesso, registrarFalha } from '../../lib/circuitBreaker'
import { obterSupabaseAdmin, supabaseAdmin } from '../../lib/supabaseAdmin'
import type { ToolDefinition } from '../types'

// -----------------------------------------------------------------------------
// Tool Definitions
// -----------------------------------------------------------------------------
const SUPABASE_TOOL_DEFINITIONS: ToolDefinition[] = [
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
]

// -----------------------------------------------------------------------------
// Supabase Tools Executor
// -----------------------------------------------------------------------------
export class SupabaseToolsExecutor {
  private readonly supabase: any

  constructor() {
    this.supabase = obterSupabaseAdmin()
  }

  getToolDefinitions(): ToolDefinition[] {
    return SUPABASE_TOOL_DEFINITIONS
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    podeExecutar(name)

    try {
      const result = await this.executeToolFunction(name, args)
      registrarSucesso(name)
      return result
    } catch (error) {
      registrarFalha(name)
      throw error
    }
  }

  private async executeToolFunction(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.supabase) {
      throw new Error('Supabase nao configurado')
    }

    switch (name) {
      case 'supabase_query':
        return this.executeQuery(args)

      case 'supabase_upsert':
        return this.executeUpsert(args)

      default:
        throw new Error(`Tool ${name} não implementada`)
    }
  }

  private async executeQuery(args: Record<string, unknown>): Promise<string> {
    const table = String(args.table || '')
    if (!table) throw new Error('table e obrigatorio')

    const filter = args.filter ? JSON.parse(String(args.filter)) : {}
    const columns = args.columns ? String(args.columns).split(',') : '*'
    const limit = args.limit ? Number(args.limit) : 100

    const { data, error } = await this.supabase
      .from(table)
      .select(columns)
      .match(filter)
      .limit(limit)

    if (error) throw new Error(`Supabase query error: ${error.message}`)
    return JSON.stringify(data)
  }

  private async executeUpsert(args: Record<string, unknown>): Promise<string> {
    const table = String(args.table || '')
    const data = args.data ? JSON.parse(String(args.data)) : {}

    if (!table) throw new Error('table e obrigatorio')
    if (!data || typeof data !== 'object') throw new Error('data e obrigatorio')

    const { data: result, error } = await this.supabase
      .from(table)
      .upsert(data)
      .select()

    if (error) throw new Error(`Supabase upsert error: ${error.message}`)
    return JSON.stringify(result)
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------
export const supabaseToolsExecutor = new SupabaseToolsExecutor()

export { SUPABASE_TOOL_DEFINITIONS }
