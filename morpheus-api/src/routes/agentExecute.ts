import { Router, type Request, type Response } from 'express'

const router = Router()

function checkKey(req: Request): boolean {
  const expected = process.env.AEGIS_API_KEY
  if (!expected) return true // open if not configured (bootstrap)
  const header =
    req.headers['x-api-key'] ||
    (typeof req.headers.authorization === 'string'
      ? req.headers.authorization.replace(/^Bearer\s+/i, '')
      : '')
  return String(header) === expected
}

function buildPlan(body: Record<string, unknown>) {
  const title = String(body.mission_title || body.title || 'Missão')
  const input = String(body.input || body.mission_description || body.mission_context || '')
  const taskId = body.task_id ? String(body.task_id) : null

  const lines = [
    `# Plano Morpheus — ${title}`,
    taskId ? `task_id: ${taskId}` : '',
    '',
    '## Objetivo',
    input.slice(0, 2000) || title,
    '',
    '## Passos técnicos',
    '1. Validar escopo e restrições (repos, ambientes, secrets).',
    '2. Preparar mudanças mínimas e evidências.',
    '3. Executar no Plutão somente após write-gate do operador.',
    '4. Zarith consolida outputs e gera auditoria.',
    '',
    '## Riscos',
    '- Cold start de serviços free-tier',
    '- Ações com efeito colateral sem aprovação',
    '',
    '## Para o worker (Plutão)',
    '- Respeitar approved_by / write-gate',
    '- Não fazer deploy/commit sem gate',
    '- Devolver evidência textual do que foi tentado',
    '',
    '## Para a síntese (Zarith)',
    '- Usar apenas outputs dos passos anteriores',
    '- Relatório final em português, objetivo',
    '',
    `_Gerado por Morpheus /api/agent/execute · ${new Date().toISOString()}_`,
  ].filter(Boolean)

  return lines.join('\n')
}

/**
 * Aegis contract: POST /api/agent/execute
 * Commands: plan_real_mission (primary), execute_real, synthesize_real (fallback)
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    if (!checkKey(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }

    const body = (req.body || {}) as Record<string, unknown>
    const command = String(body.command || 'plan_real_mission')

    if (command === 'plan_real_mission' || command === 'plan') {
      const plan = buildPlan(body)
      return res.json({
        success: true,
        agent: 'Morpheus',
        command,
        output: plan,
        plan,
      })
    }

    // Graceful fallbacks if mis-routed
    if (command === 'execute_real') {
      return res.json({
        success: true,
        agent: 'Morpheus',
        command,
        output:
          'Morpheus não executa write. Encaminhe execute_real ao Plutão. Plano de contexto:\n' +
          buildPlan(body),
      })
    }

    if (command === 'synthesize_real') {
      return res.json({
        success: true,
        agent: 'Morpheus',
        command,
        output: 'Síntese deve ser feita pelo Zarith. Morpheus só planeja.',
      })
    }

    return res.status(400).json({
      success: false,
      error: `Unsupported command: ${command}`,
      supported: ['plan_real_mission', 'execute_real', 'synthesize_real'],
    })
  } catch (err: any) {
    console.error('[agent/execute]', err)
    return res.status(500).json({ success: false, error: err.message || 'Internal error' })
  }
})

router.get('/execute', (_req, res) => {
  res.json({
    service: 'morpheus-agent-execute',
    commands: ['plan_real_mission'],
  })
})

export default router
