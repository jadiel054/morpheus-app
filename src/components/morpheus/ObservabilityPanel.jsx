import { useState } from 'react'
import { X } from 'lucide-react'
const CLAUDE_MODEL_ID = 'claude-sonnet-4-5-20250929'

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

async function testLLMProvider(provider) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const config = {
      groq: {
        key: i.groq?.key,
        url: 'https://api.groq.com/openai/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
      },
      openrouter: {
        key: i.openrouter?.key,
        url: 'https://openrouter.ai/api/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
      },
      anthropic: {
        key: i.claude?.key || i.anthropic?.key,
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: (key) => ({ 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
        body: () => JSON.stringify({ model: CLAUDE_MODEL_ID, max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
      },
      openai: {
        key: i.openai?.key,
        url: 'https://api.openai.com/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
      },
      google: {
        key: i.gemini?.key || i.google?.key,
        url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        method: 'POST',
        headers: () => ({ 'Content-Type': 'application/json' }),
        body: () => JSON.stringify({
          systemInstruction: { role: 'user', parts: [{ text: 'Teste de autenticacao' }] },
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        }),
      },
    }[provider]
    if (!config?.key) return { ok: false, error: 'Key nao configurada' }
    const url = typeof config.url === 'function' ? config.url(config.key) : config.url
    const r = await fetch(url, {
      method: config.method || 'GET',
      headers: config.headers(config.key),
      body: config.body ? config.body(config.key) : undefined,
    })
    return r.ok ? { ok: true, detail: 'Conectado' } : { ok: false, error: `HTTP ${r.status}` }
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

const TOOL_TESTS = [
  { name: 'GitHub API', icon: 'GH', test: testGitHub },
  { name: 'Vercel API', icon: 'VL', test: testVercel },
  { name: 'Supabase', icon: 'SB', test: testSupabase },
  { name: 'Groq', icon: 'GQ', test: () => testLLMProvider('groq') },
  { name: 'OpenRouter', icon: 'OR', test: () => testLLMProvider('openrouter') },
  { name: 'Anthropic', icon: 'AN', test: () => testLLMProvider('anthropic') },
  { name: 'OpenAI', icon: 'OA', test: () => testLLMProvider('openai') },
  { name: 'Google Gemini', icon: 'GG', test: () => testLLMProvider('google') },
  { name: 'Web Search', icon: 'WS', test: testWebSearch },
  { name: 'Telegram', icon: 'TG', test: async () => getTelegramStatus() },
]

export function ObservabilityPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [toolResults, setToolResults] = useState({})
  const [testingAll, setTestingAll] = useState(false)

  const testAllTools = async () => {
    setTestingAll(true)
    const results = {}
    for (const tool of TOOL_TESTS) {
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

  const tabs = ['overview', 'tools']

  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-40 flex items-center justify-center p-4">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm text-cyan font-bold">OBSERVABILIDADE</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button>
        </div>

        <div className="flex border-b border-dark-border">
          {tabs.map(tab => (
            <button key={tab} className={'settings-tab' + (activeTab === tab ? ' settings-tab--active' : '')}
              onClick={() => setActiveTab(tab)} style={{ textTransform: 'uppercase' }}>
              {tab === 'overview' ? 'Visao Geral' : 'Tools'}
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
                {TOOL_TESTS.map(tool => {
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
        </div>
      </div>
    </div>
  )
}
