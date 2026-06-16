import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { statusGeral } from '../lib/circuitBreaker.js'

const router = Router()

type CheckResultado = {
  status: 'ok' | 'erro'
  latency?: number
  error?: string
}

function obterSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  }
}

async function verificarEndpoint(nome: string, url: string, token?: string): Promise<[string, CheckResultado]> {
  if (!token) {
    return [nome, { status: 'erro', error: `Variavel ${nome.toUpperCase()} nao configurada` }]
  }

  try {
    const inicio = Date.now()
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    return [nome, resposta.ok
      ? { status: 'ok', latency: Date.now() - inicio }
      : { status: 'erro', error: `HTTP ${resposta.status}` }]
  } catch (error) {
    return [nome, { status: 'erro', error: error instanceof Error ? error.message : String(error) }]
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const checks: Record<string, CheckResultado> = {}
  const inicioTotal = Date.now()
  const supabaseConfig = obterSupabaseConfig()

  if (!supabaseConfig.url || !supabaseConfig.key) {
    checks.supabase = { status: 'erro', error: 'SUPABASE_URL/SUPABASE_SERVICE_KEY nao configurados' }
  } else {
    try {
      const inicio = Date.now()
      const supabase = createClient(supabaseConfig.url, supabaseConfig.key)
      const { error } = await supabase.from('morpheus_logs').select('id').limit(1)
      checks.supabase = error
        ? { status: 'erro', error: error.message }
        : { status: 'ok', latency: Date.now() - inicio }
    } catch (error) {
      checks.supabase = { status: 'erro', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const verificacoes = await Promise.all([
    verificarEndpoint('groq', 'https://api.groq.com/openai/v1/models', process.env.GROQ_API_KEY),
    verificarEndpoint('github', 'https://api.github.com/user', process.env.GITHUB_TOKEN),
    verificarEndpoint('vercel', 'https://api.vercel.com/v2/user', process.env.VERCEL_TOKEN),
    verificarEndpoint('openrouter', 'https://openrouter.ai/api/v1/models', process.env.OPENROUTER_API_KEY),
  ])

  for (const [nome, resultado] of verificacoes) {
    checks[nome] = resultado
  }

  const allOk = Object.values(checks).every((resultado) => resultado.status === 'ok')

  res.status(allOk ? 200 : 207).json({
    status: allOk ? 'ok' : 'degradado',
    versao: '2.0.0',
    ambiente: process.env.NODE_ENV || 'development',
    latencia_total_ms: Date.now() - inicioTotal,
    servicos: checks,
    timestamp: new Date().toISOString(),
  })
})

router.get('/circuit-breaker', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    circuitos: statusGeral(),
    timestamp: new Date().toISOString(),
  })
})

export default router
