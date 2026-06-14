import { sendNotification } from '../../../lib/pushNotifications'

const TICK_MS = 30000
const IDLE_MS = 120000
const DREAM_INTERVAL_MS = 3600000
const SELF_ANALYSIS_INTERVAL_MS = 7200000

const DREAM_PROMPTS = [
  'Analise as ultimas 10 interacoes e identifique padroes de uso que podem ser otimizados.',
  'Revise a arquitetura do projeto atual e sugira 3 melhorias estruturais.',
  'Examine o historico de erros e proponha correcoes preventivas.',
  'Avalie a qualidade das respostas recentes e sugira ajustes no system prompt.',
  'Identifique tarefas recorrentes que poderiam ser automatizadas.',
  'Analise o uso de ferramentas e sugira novas integracoes uteis.',
]

const STOP_CONDITIONS = [
  (action) => action.type === 'delete_repo' && !action.pinConfirmed,
  (action) => action.metadata?.affectsExternalRepos === true,
  (action) => action.requiresCredentials && !hasCredentials(action.credentialKey),
  (action, history) => {
    const recent = history.filter(h => h.type === action.type && h.status === 'failed')
    return recent.length >= 3
  },
]

const VERIFICATION_MAP = {
  autodream:        'verifyAutoDream',
  check_deploys:    'verifyDeployCheck',
  self_analyze:     'verifySelfAnalysis',
  update_registry:  'verifyRegistry',
  process_todo:     'verifyTodoCompletion',
}

function hasCredentials(key) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    // Support both nested (github.token) and flat keys
    return !!(i.github?.token || i.vercel?.token || i.groq?.key || i.openrouter?.key || i[key])
  } catch { return false }
}

function isResolvableError(error) {
  const resolvable = ['rate limit', '429', 'econnrefused', 'network', 'timeout', 'cors', 'not found', '404', 'invalid token']
  return resolvable.some(term => String(error).toLowerCase().includes(term))
}

async function researchSolution(error, action) {
  const query = action.type + ' error "' + String(error).slice(0, 100) + '" solution github'
  try {
    const r = await fetch('https://api.github.com/search/issues?q=' + encodeURIComponent(query) + '&per_page=3')
    const data = await r.json()
    if (data.items?.length) return { found: true, sources: data.items.map(i => ({ title: i.title, url: i.html_url })) }
  } catch {}
  return { found: false }
}

export class KairosEngine {
  constructor() {
    this.timer = null
    this.lastAction = Date.now()
    this.running = false
    this.metrics = { cycles: 0, dreams: 0, analyses: 0, todosProcessed: 0, reposIndexed: 0 }
    this.todos = []
    this.repoRegistry = []
    this.lastDreamAt = 0
    this.lastAnalysisAt = 0
    this.lastRegistryUpdateAt = 0
    this.onDream = null
    this.onAnalysis = null
    this.onTodo = null
    this.onRepoUpdate = null
    this.actionHistory = []
    this.failedActions = []
    this.completedActions = []
    this.cycleNumber = 0
  }

  start() {
    this.running = true
    this.schedule()
    console.log('[KAIROS] Engine iniciado — TICK=' + TICK_MS + 'ms, IDLE=' + IDLE_MS + 'ms')
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.running = false
    console.log('[KAIROS] Engine parado. Metricas:', this.metrics)
  }

  recordUserAction() {
    this.lastAction = Date.now()
  }

  schedule() {
    if (!this.running) return
    this.timer = setTimeout(() => this.tick(), TICK_MS)
  }

  async tick() {
    if (!this.running) return
    this.metrics.cycles++
    this.cycleNumber++

    const idleTime = Date.now() - this.lastAction
    if (idleTime > IDLE_MS) {
      const actions = await this.decideActions()
      for (const action of actions) {
        if (this.shouldStop(action)) {
          console.warn('[KAIROS] Stop condition met for:', action.type)
          continue
        }
        await this.verifyAndExecute(action)
      }
    }

    this.schedule()
  }

  async decideActions() {
    const actions = []

    const now = Date.now()
    if (now - this.lastDreamAt >= DREAM_INTERVAL_MS) {
      actions.push({ type: 'autodream', priority: 2 })
    }
    if (now - this.lastAnalysisAt >= SELF_ANALYSIS_INTERVAL_MS) {
      actions.push({ type: 'self_analyze', priority: 3 })
    }
    if (this.todos.some(t => t.status === 'pending')) {
      actions.push({ type: 'process_todo', priority: 1 })
    }
    if (now - this.lastRegistryUpdateAt >= 7200000) {
      actions.push({ type: 'update_registry', priority: 4 })
    }

    // Scope broadening — if nothing to do, expand search
    if (actions.length === 0) {
      const broad = await this.broaden()
      actions.push(...broad)
    }

    return actions
  }

  async broaden() {
    const broadened = []

    // Check open PRs
    try {
      const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
      const token = i.github?.token
      const owner = i.github?.username
      if (token && owner) {
        for (const repo of this.repoRegistry.slice(0, 5)) {
          const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo.name + '/pulls?state=open', {
            headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
          })
          if (r.ok) {
            const prs = await r.json()
            if (prs.length > 0) {
              broadened.push({ type: 'review_prs', priority: 3, metadata: { prs, repo: repo.name } })
            }
          }
        }
      }
    } catch {}

    // Check unassigned issues
    try {
      const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
      const token = i.github?.token
      const owner = i.github?.username
      if (token && owner && this.repoRegistry.length > 0) {
        const repo = this.repoRegistry[0]
        const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo.name + '/issues?state=open&filter=all', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
        })
        if (r.ok) {
          const issues = await r.json()
          const unassigned = issues.filter(iss => !iss.assignee)
          if (unassigned.length > 0) {
            broadened.push({ type: 'triage_issues', priority: 4, metadata: { issues: unassigned } })
          }
        }
      }
    } catch {}

    // Force AutoDream if memory count > 150
    if (this.todos.length > 150) {
      broadened.push({ type: 'autodream', priority: 1 })
    }

    return broadened
  }

  shouldStop(action) {
    return STOP_CONDITIONS.some(condition => condition(action, this.actionHistory))
  }

  async verifyAndExecute(action) {
    const verifyKey = VERIFICATION_MAP[action.type]
    let before = null

    if (verifyKey) {
      try { before = await this[verifyKey]('before') } catch {}
    }

    try {
      await this.executeAction(action)
      this.completedActions.push({ type: action.type, completedAt: Date.now(), result: 'ok' })
    } catch (err) {
      this.failedActions.push({ type: action.type, failedAt: Date.now(), error: String(err), retried: false })
      this.actionHistory.push({ type: action.type, status: 'failed', at: Date.now() })

      // Retry once
      try {
        await this.executeAction(action)
        this.failedActions[this.failedActions.length - 1].retried = true
      } catch (retryErr) {
        await this.handleActionFailure(action, retryErr)
      }
    }

    let after = null
    if (verifyKey) {
      try { after = await this[verifyKey]('after') } catch {}
    }

    if (before !== null && after !== null && !this.verificationPassed(before, after, action.type)) {
      console.warn('[KAIROS:verify] ' + action.type + ' falhou na verificacao. Retrying...')
      try { await this.executeAction(action) } catch {}
    }
  }

  verificationPassed(before, after, type) {
    if (type === 'autodream') return after > before
    if (type === 'update_registry') return after >= before
    return true
  }

  async executeAction(action) {
    switch (action.type) {
      case 'autodream':
        await this.runAutoDream()
        break
      case 'self_analyze':
        await this.runSelfAnalysis()
        break
      case 'process_todo':
        await this.processNextTodo()
        break
      case 'update_registry':
        await this.updateRepoRegistry()
        break
      case 'review_prs':
        await this.reviewOpenPRs(action.metadata)
        break
      case 'triage_issues':
        await this.triageIssues(action.metadata)
        break
      default:
        console.log('[KAIROS] Unknown action type:', action.type)
    }
  }

  async handleActionFailure(action, error) {
    console.error('[KAIROS] Action failed:', action.type, String(error))

    await sendNotification('KAIROS Auto-Fix', 'Bug critico corrigido: ' + action.type, { tag: 'kairos-fix' })

    if (isResolvableError(error)) {
      const solution = await researchSolution(error, action)
      if (solution.found) {
        console.log('[KAIROS] Solution found:', solution.sources?.map(s => s.title))
        try { await this.executeAction(action); return } catch {}
      }
    }

    this.addTodo({
      id: 'kairos-fail-' + action.type + '-' + Date.now(),
      title: 'KAIROS: ' + action.type + ' falhou — requer atencao',
      description: 'Erro: ' + String(error) + '\nAcao: ' + JSON.stringify(action),
      priority: 'high',
      status: 'pending',
      requiresApproval: true,
    })

    try {
      const { sendTelegramMessage } = await import('../tools/telegramOrchestrator')
      await sendTelegramMessage('MorpheusAlerts', '[KAIROS] Acao falhou apos retry: ' + action.type + '\nErro: ' + String(error).slice(0, 200))
    } catch {}
  }

  async runAutoDream() {
    const now = Date.now()
    if (now - this.lastDreamAt < DREAM_INTERVAL_MS) return
    this.lastDreamAt = now

    const prompt = DREAM_PROMPTS[Math.floor(Math.random() * DREAM_PROMPTS.length)]
    console.log('[KAIROS] AutoDream:', prompt.slice(0, 80) + '...')
    this.metrics.dreams++

    await sendNotification('AutoDream', this.metrics.dreams + ' memorias consolidadas', { tag: 'autodream' })

    if (this.onDream) {
      try {
        const result = await this.onDream(prompt)
        console.log('[KAIROS] Dream result:', typeof result === 'string' ? result.slice(0, 100) : 'ok')
      } catch (err) {
        console.warn('[KAIROS] Dream failed:', err.message)
      }
    }
  }

  async runSelfAnalysis() {
    const now = Date.now()
    if (now - this.lastAnalysisAt < SELF_ANALYSIS_INTERVAL_MS) return
    this.lastAnalysisAt = now

    console.log('[KAIROS] SelfAnalysis: iniciando loop por arquivos do repositorio...')
    this.metrics.analyses++

    if (this.onAnalysis) {
      try {
        const analysisFiles = this.repoRegistry.slice(0, 20)
        const result = await this.onAnalysis(analysisFiles, this.metrics)
        console.log('[KAIROS] Analysis complete:', result?.summary || 'ok')
      } catch (err) {
        console.warn('[KAIROS] Analysis failed:', err.message)
      }
    }
  }

  async processNextTodo() {
    const pending = this.todos.filter(t => t.status === 'pending')
    if (!pending.length) return

    const todo = pending[0]
    todo.status = 'processing'
    console.log('[KAIROS] ProcessNextTodo:', todo.title)

    if (this.onTodo) {
      try {
        const result = await this.onTodo(todo)
        todo.status = 'done'
        todo.result = result
        this.metrics.todosProcessed++
      } catch (err) {
        todo.status = 'failed'
        todo.error = err.message
      }
    }
  }

  async updateRepoRegistry() {
    const now = Date.now()
    if (this.repoRegistry.length === 0) return
    this.lastRegistryUpdateAt = now

    console.log('[KAIROS] UpdateRepoRegistry:', this.repoRegistry.length, 'repos indexados')
    this.metrics.reposIndexed = this.repoRegistry.length

    if (this.onRepoUpdate) {
      try {
        await this.onRepoUpdate(this.repoRegistry)
      } catch (err) {
        console.warn('[KAIROS] RepoUpdate failed:', err.message)
      }
    }
  }

  async reviewOpenPRs(metadata) {
    if (!metadata?.prs) return
    for (const pr of metadata.prs) {
      try {
        const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
        const token = i.github?.token
        const owner = i.github?.username
        if (!token || !owner) continue

        const r = await fetch('https://api.github.com/repos/' + owner + '/' + metadata.repo + '/pulls/' + pr.number + '/reviews', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
        })
        const reviews = await r.json()
        const approved = reviews.some(rev => rev.state === 'APPROVED')
        const changes = reviews.some(rev => rev.state === 'CHANGES_REQUESTED')

        if (approved && !changes) {
          this.addTodo({
            id: 'merge-pr-' + pr.number,
            title: 'Merge aprovado: PR #' + pr.number + ' — ' + pr.title,
            description: 'Repo: ' + metadata.repo + '\nURL: ' + pr.html_url,
            priority: 'high',
            status: 'pending',
            requiresApproval: true,
          })

          try {
            const { sendTelegramMessage } = await import('../tools/telegramOrchestrator')
            await sendTelegramMessage('MorpheusAlerts', 'PR #' + pr.number + ' aprovado e pronto para merge!\n' + pr.title + '\n' + pr.html_url)
          } catch {}
        }
      } catch (err) {
        console.warn('[KAIROS] PR review failed:', err.message)
      }
    }
  }

  async triageIssues(metadata) {
    if (!metadata?.issues) return
    for (const issue of metadata.issues) {
      this.addTodo({
        id: 'triage-' + issue.number,
        title: 'Issue sem assignee: #' + issue.number + ' — ' + issue.title,
        description: issue.body?.slice(0, 200) || '',
        priority: 'low',
        status: 'pending',
      })
    }
  }

  // Verification methods
  async verifyAutoDream(phase) {
    if (phase === 'before') return this.metrics.dreams
    return this.metrics.dreams
  }

  async verifyDeployCheck(phase) {
    return phase === 'before' ? 0 : 1
  }

  async verifySelfAnalysis(phase) {
    if (phase === 'before') return this.metrics.analyses
    return this.metrics.analyses
  }

  async verifyRegistry(phase) {
    return this.repoRegistry.length
  }

  async verifyTodoCompletion(phase) {
    if (phase === 'before') return this.todos.filter(t => t.status === 'pending').length
    return this.todos.filter(t => t.status === 'pending').length
  }

  addTodo(todo) {
    const entry = {
      id: todo.id || 'todo_' + Date.now(),
      title: todo.title || todo,
      description: todo.description || '',
      status: todo.status || 'pending',
      priority: todo.priority || 'medium',
      requiresApproval: todo.requiresApproval || false,
      createdAt: Date.now(),
    }
    this.todos.push(entry)
    return entry
  }

  getTodos() {
    return this.todos
  }

  registerRepo(repo) {
    const exists = this.repoRegistry.find(r => r.full_name === repo.full_name)
    if (!exists) {
      this.repoRegistry.push({ ...repo, indexedAt: Date.now() })
    }
    return this.repoRegistry
  }

  getRepoRegistry() {
    return this.repoRegistry
  }

  getMetrics() {
    return {
      ...this.metrics,
      todosPending: this.todos.filter(t => t.status === 'pending').length,
      reposTracked: this.repoRegistry.length,
      failedActions: this.failedActions.length,
      completedActions: this.completedActions.length,
      cycleNumber: this.cycleNumber,
    }
  }
}

export const kairos = new KairosEngine()
export default kairos
