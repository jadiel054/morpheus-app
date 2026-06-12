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
    this.onDream = null
    this.onAnalysis = null
    this.onTodo = null
    this.onRepoUpdate = null
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

    const idleTime = Date.now() - this.lastAction
    if (idleTime > IDLE_MS) {
      await this.runAutoDream()
      await this.runSelfAnalysis()
      await this.processNextTodo()
      await this.updateRepoRegistry()
    }

    this.schedule()
  }

  async runAutoDream() {
    const now = Date.now()
    if (now - this.lastDreamAt < DREAM_INTERVAL_MS) return
    this.lastDreamAt = now

    const prompt = DREAM_PROMPTS[Math.floor(Math.random() * DREAM_PROMPTS.length)]
    console.log('[KAIROS] AutoDream:', prompt.slice(0, 80) + '...')
    this.metrics.dreams++

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
    if (this.repoRegistry.length === 0) return
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

  addTodo(todo) {
    const entry = { id: 'todo_' + Date.now(), title: todo.title || todo, description: todo.description || '', status: 'pending', createdAt: Date.now() }
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
    return { ...this.metrics, todosPending: this.todos.filter(t => t.status === 'pending').length, reposTracked: this.repoRegistry.length }
  }
}

export const kairos = new KairosEngine()
export default kairos
