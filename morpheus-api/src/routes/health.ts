import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { statusGeral } from '../lib/circuitBreaker.js'

const router = Router()

type CheckResultado = {
  status: 'ok' | 'erro' | 'nao_configurado'
  latency?: number
  error?: string
}

const CLAUDE_MODEL_ID = 'claude-sonnet-4-5-20250929'

function obterSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  }
}

async function verificarEndpoint(
  nome: string,
  url: string,
  token?: string,
  headersExtras: Record<string, string> = {},
  body?: string,
): Promise<[string, CheckResultado]> {
  const headers = token
    ? { Authorization: `Bearer ${token}`, ...headersExtras }
    : headersExtras

  if (!token && Object.keys(headersExtras).length === 0) {
    return [nome, { status: 'nao_configurado', error: `Variavel ${nome.toUpperCase()} nao configurada` }]
  }

  try {
    const inicio = Date.now()
    const resposta = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
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
      // Preferir uma tabela garantida do schema v1.0 (para não quebrar deploy/healthcheck)
      // Se a tabela não existir, tenta fallback para outra conhecida.
      const testarTabela = async (tabela: string) => {
        const { error } = await supabase.from(tabela).select('id').limit(1)
        return error ? error.message : null
      }

      const erro1 = await testarTabela('user_settings')
      const erro2 = erro1 ? await testarTabela('conversations') : null

      // Se ambas falharem, reporta erro. Caso contrário, ok.
      const erroFinal = erro2 || erro1
      checks.supabase = erroFinal
        ? { status: 'erro', error: erroFinal }
        : { status: 'ok', latency: Date.now() - inicio }
    } catch (error) {
      checks.supabase = { status: 'erro', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const verificacoes = await Promise.all([
    verificarEndpoint('github', 'https://api.github.com/user', process.env.GITHUB_TOKEN),
    verificarEndpoint('vercel', 'https://api.vercel.com/v2/user', process.env.VERCEL_TOKEN),
    verificarEndpoint('groq', 'https://api.groq.com/openai/v1/models', process.env.GROQ_API_KEY),
    verificarEndpoint('openrouter', 'https://openrouter.ai/api/v1/models', process.env.OPENROUTER_API_KEY),
    verificarEndpoint(
      'anthropic',
      'https://api.anthropic.com/v1/messages',
      undefined,
      (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)
        ? {
            'x-api-key': process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          }
        : {},
      (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)
        ? JSON.stringify({ model: CLAUDE_MODEL_ID, max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] })
        : undefined,
    ),
    verificarEndpoint('openai', 'https://api.openai.com/v1/models', process.env.OPENAI_API_KEY),
    verificarEndpoint(
      'google',
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''}`,
      undefined,
      (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
        ? { 'Content-Type': 'application/json' }
        : {},
      (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
        ? JSON.stringify({
            systemInstruction: { role: 'user', parts: [{ text: 'Teste de autenticacao' }] },
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          })
        : undefined,
    ),
  ])

  for (const [nome, resultado] of verificacoes) {
    checks[nome] = resultado
  }

  const resultadosConfigurados = Object.values(checks).filter((resultado) => resultado.status !== 'nao_configurado')
  const allOk = resultadosConfigurados.every((resultado) => resultado.status === 'ok')

  // Render Health Check: não bloquear deploy por integrações opcionais.
  // Retorna sempre 200 e sinaliza "degradado" no JSON quando necessário.
  res.status(200).json({
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
