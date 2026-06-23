import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/authContext'
import { getApiBaseUrl } from '../../lib/apiBaseUrl'

function getNested(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj)
}

async function testGitHub() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.github?.token
    if (!token) return { ok: false, error: 'Token nao configurado' }
    const r = await fetch('https://api.github.com/user/repos?per_page=1', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return r.ok ? { ok: true, detail: 'Conectado' } : { ok: false, error: `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testVercel() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.vercel?.token
    if (!token) return { ok: false, error: 'Token nao configurado' }
    const r = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return r.ok ? { ok: true, detail: 'Conectado' } : { ok: false, error: `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testSupabase() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const url = i.supabase?.url
    const key = i.supabase?.anonKey
    if (!url || !key) return { ok: false, error: 'Nao configurado' }
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    return r.status < 500 ? { ok: true, detail: 'Conectado' } : { ok: false, error: `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

function normalizeApiKey(value) {
  return String(value || '').trim()
}

function readIntegrationValue(obj, path) {
  return obj?.[path] !== undefined
    ? obj[path]
    : path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj)
}

function resolveProviderKey(integrations, provider) {
  if (provider === 'openrouter') {
    return normalizeApiKey(
      readIntegrationValue(integrations, 'openrouter.key')
      || readIntegrationValue(integrations, 'deepseek.key')
      || readIntegrationValue(integrations, 'qwen.key')
      || readIntegrationValue(integrations, 'glm.key')
      || '',
    )
  }
  if (provider === 'anthropic') {
    return normalizeApiKey(readIntegrationValue(integrations, 'claude.key') || readIntegrationValue(integrations, 'anthropic.key') || '')
  }
  if (provider === 'google') {
    return normalizeApiKey(readIntegrationValue(integrations, 'gemini.key') || readIntegrationValue(integrations, 'google.key') || '')
  }
  return normalizeApiKey(readIntegrationValue(integrations, `${provider}.key`) || '')
}

async function testLLMProvider(apiBaseUrl, accessToken, provider) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const providerKeys = {
      groq: resolveProviderKey(i, 'groq'),
      cerebras: resolveProviderKey(i, 'cerebras'),
      openrouter: resolveProviderKey(i, 'openrouter'),
      anthropic: resolveProviderKey(i, 'anthropic'),
      openai: resolveProviderKey(i, 'openai'),
      google: resolveProviderKey(i, 'google'),
    }
    const key = providerKeys[provider]
    if (!accessToken) return { ok: false, error: 'Sessao nao disponivel para testar via backend' }
    if (!key) return { ok: false, error: 'Key nao configurada' }
    const r = await fetch(`${apiBaseUrl}/api/credentials/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ provider, key }),
    })
    const text = await r.text()
    let payload = {}
    try { payload = text ? JSON.parse(text) : {} } catch { payload = { message: text } }
    return r.ok
      ? { ok: true, detail: payload.message || 'Conectado' }
      : { ok: false, error: payload.message || `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testWebSearch() {
  try {
    const r = await fetch('https://api.duckduckgo.com/?q=test&format=json')
    return r.ok ? { ok: true, detail: 'Conectado' } : { ok: false, error: `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

function getTelegramStatus() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const bots = ['morpheuscomando', 'morpheusalerts', 'morpheusdev', 'morpheusdebugger',
      'morpheusanalytics', 'morpheusops', 'morpheusarchitect', 'morpheusauditor',
      'morpheustrainer', 'morpheusmemory']
    const configured = bots.filter(b => i.telegram?.[b]?.token && i.telegram?.[b]?.chatId)
    return { ok: configured.length > 0, detail: `${configured.length}/10 bots configurados` }
  } catch { return { ok: false, error: 'Erro' } }
}

function formatDateTime(value) {
  if (!value) return 'N/D'
  try { return new Date(value).toLocaleString('pt-BR') } catch { return value }
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/D'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'N/D'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return String(value)
  return parsed.toLocaleString('pt-BR')
}

function buildTextReport(request) {
  if (!request) return 'Nenhuma execução selecionada.'
  const rate = request.rateLimit || {}
  const final = request.finalDiagnostic || {}
  return [
    `Request ID: ${request.requestId}`,
    `Conversation ID: ${request.conversationId}`,
    `Status: ${request.status}`,
    `Provider: ${request.providerUsed || 'N/D'}`,
    `Modelo: ${request.modelUsed || 'N/D'}`,
    `Início: ${formatDateTime(request.startedAt)}`,
    `Duração: ${formatDuration(request.totalExecutionMs)}`,
    '',
    'Tokens:',
    `- System Prompt: ${formatNumber(request.tokens?.systemPromptTokens)}`,
    `- History: ${formatNumber(request.tokens?.historyTokens)}`,
    `- Memory: ${formatNumber(request.tokens?.memoryTokens)}`,
    `- Tool Results: ${formatNumber(request.tokens?.toolResultTokens)}`,
    `- Tool Schemas: ${formatNumber(request.tokens?.toolSchemaTokens)}`,
    `- User: ${formatNumber(request.tokens?.userTokens)}`,
    `- Completion: ${formatNumber(request.tokens?.completionTokens)}`,
    `- Total: ${formatNumber(request.tokens?.totalTokens || request.tokens?.providerTotalTokens)}`,
    '',
    `Loops: ${formatNumber(request.totalLoops)}`,
    `Chamadas ao modelo: ${formatNumber(request.modelCalls?.length)}`,
    `Tool calls: ${formatNumber(request.toolCalls?.length)}`,
    `Maior consumidor: ${final.maiorConsumidor || 'N/D'}`,
    '',
    'Fallbacks:',
    ...(request.fallbacks?.length
      ? request.fallbacks.map((item) => `- ${item.fromProvider}/${item.fromModel} -> ${item.toProvider}/${item.toModel} | ${item.reason}`)
      : ['- Nenhum fallback registrado.']),
  ].join('\n')
}

function MetricCard({ label, value, accent = 'text-cyan' }) {
  return (
    <div className="bg-dark-bg border border-dark-border rounded p-3">
      <p className="text-[11px] opacity-50 uppercase tracking-wider">{label}</p>
      <p className={`text-base font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  )
}

function SectionTitle({ children, actions = null }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs opacity-60 uppercase tracking-[0.2em]">{children}</p>
      {actions}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    executando: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
    concluida: 'text-green-300 border-green-500/30 bg-green-500/10',
    erro: 'text-pink-300 border-pink-500/30 bg-pink-500/10',
  }
  return (
    <span className={`px-2 py-1 rounded border text-[11px] font-mono ${map[status] || 'text-cyan border-cyan/20 bg-cyan/5'}`}>
      {String(status || 'N/D').toUpperCase()}
    </span>
  )
}

export function ObservabilityPanel({ onClose }) {
  const { session } = useAuth()
  const apiBaseUrl = getApiBaseUrl()
  const [activeTab, setActiveTab] = useState('overview')
  const [toolResults, setToolResults] = useState({})
  const [testingAll, setTestingAll] = useState(false)
  const [auditSnapshot, setAuditSnapshot] = useState({ requests: [], updatedAt: null })
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [streamStatus, setStreamStatus] = useState('conectando')
  const [copyStatus, setCopyStatus] = useState('')

  const toolTests = [
    { name: 'GitHub API', icon: 'GH', test: testGitHub },
    { name: 'Vercel API', icon: 'VL', test: testVercel },
    { name: 'Supabase', icon: 'SB', test: testSupabase },
    { name: 'Groq', icon: 'GQ', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'groq') },
    { name: 'Cerebras', icon: 'CB', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'cerebras') },
    { name: 'OpenRouter', icon: 'OR', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'openrouter') },
    { name: 'Anthropic', icon: 'AN', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'anthropic') },
    { name: 'OpenAI', icon: 'OA', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'openai') },
    { name: 'Google Gemini', icon: 'GG', test: () => testLLMProvider(apiBaseUrl, session?.access_token, 'google') },
    { name: 'Web Search', icon: 'WS', test: testWebSearch },
    { name: 'Telegram', icon: 'TG', test: async () => getTelegramStatus() },
  ]

  const testAllTools = async () => {
    setTestingAll(true)
    const results = {}
    for (const tool of toolTests) {
      results[tool.name] = '...'
      setToolResults({ ...results })
      try {
        const r = await tool.test()
        results[tool.name] = r
      } catch (e) {
        results[tool.name] = { ok: false, error: e.message }
      }
      setToolResults({ ...results })
    }
    setTestingAll(false)
  }

  useEffect(() => {
    if (!session?.access_token) return undefined
    let mounted = true
    let reconnectTimer = null
    const controller = new AbortController()

    const applySnapshot = (snapshot) => {
      if (!mounted) return
      setAuditSnapshot(snapshot)
      setSelectedRequestId(prev => {
        if (prev && snapshot.requests.some(item => item.requestId === prev)) return prev
        return snapshot.requests[0]?.requestId || ''
      })
    }

    const loadSnapshot = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/observability/snapshot`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const snapshot = await response.json()
        applySnapshot(snapshot)
      } catch (error) {
        if (mounted) setStreamStatus(`erro: ${error.message}`)
      }
    }

    const connect = async () => {
      try {
        setStreamStatus('conectando')
        const response = await fetch(`${apiBaseUrl}/api/observability/stream`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        setStreamStatus('ao vivo')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (mounted) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''

          for (const chunk of chunks) {
            if (!chunk.trim() || chunk.startsWith(':')) continue
            const eventMatch = chunk.match(/event:\s*(.+)/)
            const dataMatch = chunk.match(/data:\s*([\s\S]+)/)
            if (!eventMatch || !dataMatch) continue
            const eventType = eventMatch[1].trim()
            const payload = JSON.parse(dataMatch[1])
            if (eventType === 'snapshot') applySnapshot(payload)
          }
        }

        if (mounted && !controller.signal.aborted) {
          setStreamStatus('reconectando')
          reconnectTimer = setTimeout(connect, 2000)
        }
      } catch (error) {
        if (!mounted || controller.signal.aborted) return
        setStreamStatus(`erro: ${error.message}`)
        reconnectTimer = setTimeout(connect, 2500)
      }
    }

    loadSnapshot()
    connect()

    return () => {
      mounted = false
      controller.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [apiBaseUrl, session])

  const tabs = ['overview', 'tools', 'monitoring']
  const selectedRequest = useMemo(
    () => auditSnapshot.requests.find(item => item.requestId === selectedRequestId) || auditSnapshot.requests[0] || null,
    [auditSnapshot, selectedRequestId],
  )

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildTextReport(selectedRequest))
      setCopyStatus('Relatório copiado')
    } catch {
      setCopyStatus('Falha ao copiar')
    }
    setTimeout(() => setCopyStatus(''), 2000)
  }

  const exportJson = () => {
    if (!selectedRequest) return
    const blob = new Blob([JSON.stringify(selectedRequest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `morpheus-observabilidade-${selectedRequest.requestId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-40 flex items-center justify-center p-4">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm text-cyan font-bold">OBSERVABILIDADE</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button>
        </div>

        <div className="flex border-b border-dark-border">
          {tabs.map(tab => (
            <button key={tab} className={'settings-tab' + (activeTab === tab ? ' settings-tab--active' : '')}
              onClick={() => setActiveTab(tab)} style={{ textTransform: 'uppercase' }}>
              {tab === 'overview' ? 'Visao Geral' : tab === 'tools' ? 'Tools' : 'Monitoramento'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {['SESSOES AGENTE', 'MEMORIAS', 'DEPLOYS', 'LLM CALLS'].map(l => (
                  <div key={l} className="bg-dark-bg border border-dark-border rounded p-3">
                    <p className="text-xs opacity-50">{l}</p>
                    <p className="text-lg text-cyan font-bold">0</p>
                  </div>
                ))}
              </div>
              <p className="text-xs opacity-40">Logs completos disponiveis no Supabase (agent_sessions).</p>
            </>
          )}

          {activeTab === 'tools' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs opacity-60">STATUS DAS TOOLS</p>
                <button onClick={testAllTools} disabled={testingAll} style={{
                  padding: '6px 14px', background: testingAll ? 'rgba(0,255,255,0.15)' : 'transparent',
                  border: '1px solid rgba(0,255,255,0.3)', borderRadius: '6px',
                  color: '#00FFFF', fontFamily: 'monospace', fontSize: '11px', cursor: 'pointer',
                }}>
                  {testingAll ? 'TESTANDO...' : 'TESTAR TODAS'}
                </button>
              </div>

              <div className="space-y-2">
                {toolTests.map(tool => {
                  const result = toolResults[tool.name]
                  const isOk = result?.ok === true
                  const isFail = result?.ok === false
                  const isPending = result === '...'
                  return (
                    <div key={tool.name} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 14px', background: 'rgba(0,255,255,0.03)',
                      border: '1px solid rgba(0,255,255,0.08)', borderRadius: '8px',
                    }}>
                      <span style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: 'rgba(0,255,255,0.1)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'monospace', fontSize: '10px', color: '#00FFFF',
                      }}>{tool.icon}</span>
                      <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', color: '#e2e8f0' }}>{tool.name}</span>
                      {isPending && <span style={{ color: 'rgba(0,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace' }}>...</span>}
                      {isOk && <span style={{ color: '#00FF88', fontSize: '11px', fontFamily: 'monospace' }}>{result.detail || 'OK'}</span>}
                      {isFail && <span style={{ color: '#ff0080', fontSize: '11px', fontFamily: 'monospace' }}>{result.error || 'FALHA'}</span>}
                      {!result && <span style={{ color: 'rgba(0,255,255,0.2)', fontSize: '11px', fontFamily: 'monospace' }}>nao testado</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-5">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs opacity-60 uppercase tracking-[0.2em]">Centro de Monitoramento</p>
                  <p className="text-xs opacity-40 mt-1">Atualização em tempo real do pipeline do Morpheus via SSE.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`px-2 py-1 rounded border text-[11px] font-mono ${streamStatus === 'ao vivo' ? 'text-green-300 border-green-500/30 bg-green-500/10' : 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'}`}>
                    {streamStatus.toUpperCase()}
                  </span>
                  <button onClick={copyReport} className="px-3 py-2 rounded border border-cyan/20 text-cyan text-[11px] font-mono">
                    Copiar relatório
                  </button>
                  <button onClick={exportJson} disabled={!selectedRequest} className="px-3 py-2 rounded border border-cyan/20 text-cyan text-[11px] font-mono disabled:opacity-40">
                    Exportar JSON
                  </button>
                </div>
              </div>

              {copyStatus && <p className="text-xs text-cyan">{copyStatus}</p>}

              <div className="grid lg:grid-cols-[280px,1fr] gap-4">
                <div className="bg-dark-bg border border-dark-border rounded p-3 h-fit">
                  <SectionTitle>Requisições</SectionTitle>
                  <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                    {auditSnapshot.requests.length === 0 && (
                      <p className="text-xs opacity-40">Nenhuma execução monitorada ainda.</p>
                    )}
                    {auditSnapshot.requests.map(item => (
                      <button
                        key={item.requestId}
                        onClick={() => setSelectedRequestId(item.requestId)}
                        className={`w-full text-left rounded border px-3 py-2 ${selectedRequest?.requestId === item.requestId ? 'border-cyan/40 bg-cyan/5' : 'border-dark-border bg-transparent'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-cyan font-mono truncate">{item.requestId.slice(0, 8)}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-[11px] opacity-60 mt-2 truncate">{item.modelUsed || 'Modelo pendente'}</p>
                        <p className="text-[11px] opacity-40 mt-1">{formatDateTime(item.updatedAt)}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  {!selectedRequest && (
                    <div className="bg-dark-bg border border-dark-border rounded p-4">
                      <p className="text-sm text-cyan">Aguardando uma execução do Morpheus para iniciar o monitoramento.</p>
                    </div>
                  )}

                  {selectedRequest && (
                    <>
                      <div className="bg-dark-bg border border-dark-border rounded p-4">
                        <SectionTitle>Resumo da requisição</SectionTitle>
                        <div className="grid md:grid-cols-3 gap-3">
                          <MetricCard label="Request ID" value={selectedRequest.requestId.slice(0, 12)} />
                          <MetricCard label="Conversation ID" value={selectedRequest.conversationId} />
                          <MetricCard label="Atualizado" value={formatDateTime(selectedRequest.updatedAt)} />
                          <MetricCard label="Status" value={selectedRequest.status} accent={selectedRequest.status === 'erro' ? 'text-pink-300' : selectedRequest.status === 'concluida' ? 'text-green-300' : 'text-yellow-300'} />
                          <MetricCard label="Provider" value={selectedRequest.providerUsed || 'N/D'} />
                          <MetricCard label="Modelo" value={selectedRequest.modelUsed || 'N/D'} />
                          <MetricCard label="Tempo total" value={formatDuration(selectedRequest.totalExecutionMs)} />
                          <MetricCard label="Início" value={formatDateTime(selectedRequest.startedAt)} />
                          <MetricCard label="Fim" value={selectedRequest.endedAt ? formatDateTime(selectedRequest.endedAt) : 'Em execução'} />
                        </div>
                      </div>

                      <div className="bg-dark-bg border border-dark-border rounded p-4">
                        <SectionTitle>Consumo de tokens</SectionTitle>
                        <div className="grid md:grid-cols-4 gap-3">
                          <MetricCard label="System Prompt" value={formatNumber(selectedRequest.tokens?.systemPromptTokens)} />
                          <MetricCard label="History" value={formatNumber(selectedRequest.tokens?.historyTokens)} />
                          <MetricCard label="Memory" value={formatNumber(selectedRequest.tokens?.memoryTokens)} />
                          <MetricCard label="Tool Results" value={formatNumber(selectedRequest.tokens?.toolResultTokens)} />
                          <MetricCard label="Tool Schemas" value={formatNumber(selectedRequest.tokens?.toolSchemaTokens)} />
                          <MetricCard label="User" value={formatNumber(selectedRequest.tokens?.userTokens)} />
                          <MetricCard label="Completion" value={formatNumber(selectedRequest.tokens?.completionTokens)} />
                          <MetricCard label="Total" value={formatNumber(selectedRequest.tokens?.providerTotalTokens || selectedRequest.tokens?.totalTokens)} accent="text-green-300" />
                        </div>
                      </div>

                      <div className="grid xl:grid-cols-2 gap-4">
                        <div className="bg-dark-bg border border-dark-border rounded p-4">
                          <SectionTitle>Loops do pipeline</SectionTitle>
                          <div className="space-y-2">
                            <MetricCard label="Loop atual" value={formatNumber(selectedRequest.currentLoop)} />
                            <MetricCard label="Total de loops" value={formatNumber(selectedRequest.totalLoops)} />
                            <div className="space-y-2">
                              {selectedRequest.loopTransitions?.length ? selectedRequest.loopTransitions.map((item, index) => (
                                <div key={`${item.fromLoop}-${item.toLoop}-${index}`} className="border border-dark-border rounded p-3 text-xs">
                                  <p className="text-cyan font-mono">Loop {item.fromLoop} → Loop {item.toLoop}</p>
                                  <p className="opacity-60 mt-1">{item.reason}</p>
                                  {item.tools?.length > 0 && <p className="opacity-40 mt-1">Tools: {item.tools.join(', ')}</p>}
                                </div>
                              )) : <p className="text-xs opacity-40">Nenhuma transição registrada.</p>}
                            </div>
                          </div>
                        </div>

                        <div className="bg-dark-bg border border-dark-border rounded p-4">
                          <SectionTitle>Memória e contexto</SectionTitle>
                          <div className="grid grid-cols-2 gap-3">
                            <MetricCard label="Memórias carregadas" value={formatNumber(selectedRequest.context?.memoryCount)} />
                            <MetricCard label="Mensagens enviadas" value={formatNumber(selectedRequest.context?.messagesSent)} />
                            <MetricCard label="Tamanho contexto" value={formatNumber(selectedRequest.context?.contextSizeChars)} />
                            <MetricCard label="Mensagens removidas" value={formatNumber(selectedRequest.context?.removedMessages)} />
                            <MetricCard label="Contexto compactado" value={selectedRequest.context?.compacted ? 'Sim' : 'Não'} />
                            <MetricCard label="Último erro" value={selectedRequest.lastError || 'Nenhum'} accent={selectedRequest.lastError ? 'text-pink-300' : 'text-cyan'} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-dark-bg border border-dark-border rounded p-4">
                        <SectionTitle>Chamadas ao modelo</SectionTitle>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="opacity-50">
                              <tr className="text-left">
                                <th className="pb-2">Horário</th>
                                <th className="pb-2">Provider</th>
                                <th className="pb-2">Modelo</th>
                                <th className="pb-2">Tentativa</th>
                                <th className="pb-2">Tokens</th>
                                <th className="pb-2">Duração</th>
                                <th className="pb-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRequest.modelCalls?.length ? selectedRequest.modelCalls.map(call => (
                                <tr key={call.callId} className="border-t border-dark-border">
                                  <td className="py-2">{formatDateTime(call.timestamp)}</td>
                                  <td className="py-2">{call.provider}</td>
                                  <td className="py-2">{call.model}</td>
                                  <td className="py-2">{call.attempt}</td>
                                  <td className="py-2">{formatNumber(call.totalTokens || call.tokens)}</td>
                                  <td className="py-2">{formatDuration(call.durationMs)}</td>
                                  <td className="py-2">{call.status}</td>
                                </tr>
                              )) : (
                                <tr><td className="py-3 opacity-40" colSpan="7">Nenhuma chamada ao modelo registrada.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-dark-bg border border-dark-border rounded p-4">
                        <SectionTitle>Tool calls</SectionTitle>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="opacity-50">
                              <tr className="text-left">
                                <th className="pb-2">Tool</th>
                                <th className="pb-2">Argumentos</th>
                                <th className="pb-2">Tokens retornados</th>
                                <th className="pb-2">Tempo</th>
                                <th className="pb-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRequest.toolCalls?.length ? selectedRequest.toolCalls.map(call => (
                                <tr key={call.toolCallId} className="border-t border-dark-border align-top">
                                  <td className="py-2">{call.toolName}</td>
                                  <td className="py-2 max-w-[360px] break-words">{call.toolArguments}</td>
                                  <td className="py-2">{formatNumber(call.tokensReturned)}</td>
                                  <td className="py-2">{formatDuration(call.timeMs)}</td>
                                  <td className="py-2">{call.status}</td>
                                </tr>
                              )) : (
                                <tr><td className="py-3 opacity-40" colSpan="5">Nenhuma tool call registrada.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid xl:grid-cols-2 gap-4">
                        <div className="bg-dark-bg border border-dark-border rounded p-4">
                          <SectionTitle>Fallbacks</SectionTitle>
                          <div className="space-y-2">
                            {selectedRequest.fallbacks?.length ? selectedRequest.fallbacks.map((item, index) => (
                              <div key={`${item.timestamp}-${index}`} className="border border-dark-border rounded p-3 text-xs">
                                <p className="text-cyan">{item.fromProvider} → {item.toProvider}</p>
                                <p className="opacity-60 mt-1">Modelos: {item.fromModel} → {item.toModel}</p>
                                <p className="opacity-60 mt-1">Motivo: {item.reason}</p>
                                <p className="opacity-40 mt-1">{item.error}</p>
                              </div>
                            )) : <p className="text-xs opacity-40">Nenhum fallback registrado.</p>}
                          </div>
                        </div>

                        <div className="bg-dark-bg border border-dark-border rounded p-4">
                          <SectionTitle>Rate limits</SectionTitle>
                          <div className="grid grid-cols-2 gap-3">
                            <MetricCard label="TPM Limite" value={formatNumber(selectedRequest.rateLimit?.limitTokens)} />
                            <MetricCard label="TPM Consumido" value={formatNumber(selectedRequest.rateLimit?.usedTokens)} />
                            <MetricCard label="TPM Restante" value={formatNumber(selectedRequest.rateLimit?.remainingTokens)} />
                            <MetricCard label="RPM Limite" value={formatNumber(selectedRequest.rateLimit?.limitRequests)} />
                            <MetricCard label="RPM Restante" value={formatNumber(selectedRequest.rateLimit?.remainingRequests)} />
                            <MetricCard label="Próximo reset" value={selectedRequest.rateLimit?.resetTokens || selectedRequest.rateLimit?.retryAfter || 'N/D'} />
                          </div>
                          <p className="text-xs opacity-40 mt-3 break-words">
                            Último erro: {selectedRequest.rateLimit?.lastError || 'Nenhum'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-dark-bg border border-dark-border rounded p-4">
                        <SectionTitle>Diagnóstico final</SectionTitle>
                        <div className="grid md:grid-cols-3 gap-3">
                          <MetricCard label="Loops" value={formatNumber(selectedRequest.finalDiagnostic?.loops || selectedRequest.totalLoops)} />
                          <MetricCard label="Chamadas ao Groq" value={formatNumber(selectedRequest.finalDiagnostic?.groqCalls)} />
                          <MetricCard label="Tool calls" value={formatNumber(selectedRequest.finalDiagnostic?.toolCalls || selectedRequest.toolCalls?.length)} />
                          <MetricCard label="Tokens totais" value={formatNumber(selectedRequest.finalDiagnostic?.totalTokens)} />
                          <MetricCard label="Tempo total" value={formatDuration(selectedRequest.finalDiagnostic?.tempoTotalMs || selectedRequest.totalExecutionMs)} />
                          <MetricCard label="Maior consumidor" value={selectedRequest.finalDiagnostic?.maiorConsumidor || 'N/D'} accent="text-green-300" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
