import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/authContext'
import { ProtocolHeader } from '../components/morpheus/ProtocolHeader'
import { ChatInput } from '../components/morpheus/ChatInput'
import { MessageBubble } from '../components/morpheus/MessageBubble'
import { ConversationTabs } from '../components/morpheus/ConversationTabs'
import { ThinkingStatus } from '../components/morpheus/ThinkingStatus'
import { HudOverlay } from '../components/morpheus/HudOverlay'
import { SplashScreen } from '../components/morpheus/SplashScreen'
import { LoginScreen } from '../components/morpheus/LoginScreen'
import { CombatModeBar } from '../components/morpheus/CombatModeBar'
import { BiometricGate } from '../components/morpheus/BiometricGate'
import { NewDeviceChallenge } from '../components/morpheus/NewDeviceChallenge'
import { WelcomeMessage } from '../components/morpheus/WelcomeMessage'
import { ResetPasswordModal } from '../components/morpheus/ResetPasswordModal'
import { supabase } from '../lib/supabaseClient'
import { generateId, truncate } from '../lib/utils'
import { speak } from '../lib/ttsDispatcher'
import { useKokoroTTS } from '../components/morpheus/useKokoroTTS'
import { useVoiceLive } from '../components/morpheus/useVoiceLive'
import { routeToAgent } from '../components/morpheus/agents/agentRouter'
import { buildAgentSystemPrompt } from '../components/morpheus/agents/agentPrompts'
import { processAndSaveMemory, buildMemoryPrompt, loadUserMemory, saveMemoryToSupabase } from '../components/morpheus/agents/memoryEngine'
import { loadEvolutionProfile, buildStyleLayer, incrementMessageCount } from '../components/morpheus/agents/evolutionEngine'
import { analyzeSentiment, selectArchetype, buildPersonalityLayer } from '../components/morpheus/agents/personalityEngine'
import { kairos } from '../components/morpheus/agents/kairosEngine'
import { getDeviceId, getDeviceLabel, getIpInfo, isDeviceTrusted, trustDevice, registerSession } from '../components/morpheus/security/deviceGuard'
import { buildContentWithAttachments } from '../lib/fileAttachmentHandler'
import { shouldAutoSearch, webSearch, formatSearchResults } from '../components/morpheus/tools/webSearch'
import { classifyGitHubError, investigateNotFound } from '../lib/errorHandler'

import { SettingsPanel } from '../components/morpheus/SettingsPanel'
import { ConversationHistory } from '../components/morpheus/ConversationHistory'
import { DeployMonitor } from '../components/morpheus/DeployMonitor'
import { ObservabilityPanel } from '../components/morpheus/ObservabilityPanel'
import { AgentPlannerPanel } from '../components/morpheus/AgentPlannerPanel'

const DEFAULT_TAB = { id: 'tab-1', title: 'Nova Conversa', messages: [] }
const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000

function migrateOldKeys() {
  try {
    const migrated = localStorage.getItem('morpheus_keys_migrated')
    if (migrated) return
    const old = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    let changed = false
    const migrations = {
      'groq_key': 'groq.key', 'openrouter_key': 'openrouter.key', 'deepseek_key': 'deepseek.key',
      'gemini_key': 'gemini.key', 'openai_key': 'openai.key', 'claude_key': 'claude.key',
      'github_token': 'github.token', 'github_username': 'github.username', 'github_repos': 'github.repos',
      'vercel_token': 'vercel.token', 'vercel_project_id': 'vercel.projectId', 'vercel_team_id': 'vercel.teamId',
      'supabase_url': 'supabase.url', 'supabase_anon_key': 'supabase.anonKey', 'supabase_service_key': 'supabase.serviceKey',
      'brave_key': 'brave.api_key', 'openweather_key': 'openweather.key', 'elevenlabs_key': 'elevenlabs.key',
      'resend_key': 'resend.key', 'alert_email': 'alerts.email', 'alert_phone': 'alerts.phone',
    }
    for (const [oldKey, newPath] of Object.entries(migrations)) {
      if (old[oldKey] && !getNestedLocal(old, newPath)) { old[newPath] = old[oldKey]; delete old[oldKey]; changed = true }
    }
    if (changed) { localStorage.setItem('morpheus_integrations', JSON.stringify(old)) }
    localStorage.setItem('morpheus_keys_migrated', 'true')
  } catch (e) { console.warn('[MORPHEUS] Erro na migracao:', e) }
}

function getNestedLocal(obj, path) { return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj) }

async function syncRepoRegistry() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.github?.token
    if (!token) return
    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const repos = await res.json()
    const registry = repos.map(r => ({ name: r.name, full_name: r.full_name, url: r.html_url, private: r.private, language: r.language, updated: r.updated_at, description: r.description }))
    localStorage.setItem('morpheus_repo_registry', JSON.stringify(registry))
  } catch (e) { console.warn('[MORPHEUS] Falha ao sincronizar registry:', e) }
}

function resolveRepoFromMessage(text) {
  try {
    const registry = JSON.parse(localStorage.getItem('morpheus_repo_registry') || '[]')
    if (!registry.length) return null
    for (const repo of registry) {
      const patterns = [repo.name.toLowerCase(), repo.name.toLowerCase().replace(/-/g, ' '), repo.name.toLowerCase().split('-')[0]]
      for (const pattern of patterns) { if (pattern.length > 2 && text.toLowerCase().includes(pattern)) return repo }
    }
    return null
  } catch { return null }
}

function resolveRepo(text, registry) {
  if (!registry?.length) return null
  const lower = text.toLowerCase()
  for (const r of registry) {
    const names = [r.name.toLowerCase(), r.name.toLowerCase().replace(/-/g, ' '), r.name.toLowerCase().replace(/-/g, ''), r.name.toLowerCase().split('-')[0]]
    if (names.some(n => lower.includes(n))) return r.name
  }
  return null
}

async function githubFetch(url, options = {}) {
  const integrations = (() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()
  const token = integrations.github?.token
  if (!token) {
    return { ok: false, classified: { type: 'TOKEN_MISSING', retryable: false, userMessage: 'Configure o GitHub Token em Configuracoes > Integracoes > GITHUB > GitHub Token (PAT)', action: 'CONFIGURE_TOKEN' } }
  }
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } })
  if (!res.ok) {
    const hdrObj = {}; res.headers.forEach((v, k) => { hdrObj[k] = v })
    const classified = classifyGitHubError(res.status, hdrObj, null, options.context)
    return { ok: false, status: res.status, classified, headers: res.headers }
  }
  return { ok: true, data: await res.json(), headers: res.headers }
}

async function detectAndExecuteTool(text, { setPlanSteps, updatePlanStep, setPlanVisible, setActiveToolCall, addThinkingStep, clearThinkingSteps, callAI }) {
  const lower = text.toLowerCase()
  const integrations = (() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()
  const settings = (() => { try { return JSON.parse(localStorage.getItem('morpheus_settings') || '{}') } catch { return {} } })()
  const registry = (() => { try { return JSON.parse(localStorage.getItem('morpheus_repo_registry') || '[]') } catch { return [] } })()

  const ghToken = integrations.github?.token || ''
  const ghUser = integrations.github?.username || 'jadiel054'

  // ---- COMMIT / EDITAR ARQUIVO ----
  if (/(commit|salv(ar|e)|modific(ar|a)|edit(ar|a)|adicion(ar|a)|atualiz(ar|a))\s+.*(arquivo|file|README|\.js|\.ts|\.jsx|\.tsx|\.md|\.py)/i.test(text) || /cri(ar|e)\s+.*(arquivo|file)/i.test(text)) {
    const repo = resolveRepo(text, registry)
    if (!repo) {
      if (!registry.length) return 'Nenhum repositorio encontrado. Digite "liste meus repositorios" primeiro.'
      return `Qual repositorio voce quer modificar?\n\n${registry.map((r, i) => `${i+1}. ${r.name}`).join('\n')}\n\nDigite o numero ou o nome.`
    }
    setPlanSteps([{ id: '1', title: 'Analisar pedido', status: 'running' },{ id: '2', title: 'Ler arquivo atual', status: 'pending' },{ id: '3', title: 'Gerar conteudo novo', status: 'pending' },{ id: '4', title: 'Verificar no sandbox', status: 'pending' },{ id: '5', title: 'Commitar', status: 'pending' }])
    setPlanVisible(true); setActiveToolCall({ name: 'github_commit', input: { repo }, status: 'running', result: null })
    updatePlanStep('1', 'running')
    let parsed
    try {
      const planResult = await callAI('Voce e um assistente que extrai informacoes estruturadas de pedidos de edicao de codigo. Responda APENAS com JSON valido, sem markdown.', `Pedido: "${text}"\nRepositorio identificado: ${repo}\n\nExtraia:\n{\n  "filePath": "caminho do arquivo (ex: README.md, src/app.js)",\n  "action": "create | edit | append | delete",\n  "content": "conteudo a adicionar/criar (se aplicavel)",\n  "commitMessage": "mensagem de commit no formato conventional commits",\n  "createIfNotExists": true/false\n}`, [])
      parsed = JSON.parse(planResult.content.replace(/```json|```/g, '').trim())
    } catch { updatePlanStep('1', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: 'Parse error' })); return 'Nao consegui entender o que modificar. Seja mais especifico: "No arquivo X do repositorio Y, faca Z"' }
    updatePlanStep('1', 'done')
    const { filePath, action, content, commitMessage, createIfNotExists } = parsed

    updatePlanStep('2', 'running')
    let currentContent = ''; let currentSha = null
    if (action !== 'create') {
      const readResult = await githubFetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${filePath}`, { context: { requiredScopes: ['repo'] } })
      if (readResult.ok) { currentContent = atob(readResult.data.content.replace(/\n/g, '')); currentSha = readResult.data.sha; updatePlanStep('2', 'done') }
      else if (createIfNotExists || action === 'create') { currentContent = ''; updatePlanStep('2', 'done') }
      else {
        if (readResult.classified?.action === 'INVESTIGATE') { addThinkingStep('Investigando causa do erro...'); const investigation = await investigateNotFound(repo, filePath, ghToken, ghUser); clearThinkingSteps(); updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: investigation.diagnosis })); return investigation.message }
        updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: readResult.classified?.userMessage || `HTTP ${readResult.status}` })); return readResult.classified?.userMessage || `Erro ao ler arquivo: ${readResult.status}`
      }
    } else { updatePlanStep('2', 'done') }

    updatePlanStep('3', 'running')
    let newContent = content
    if (action === 'append') { newContent = currentContent + '\n' + content }
    else if (action === 'edit') { const editResult = await callAI('Voce e um editor de codigo. Aplique a modificacao solicitada e retorne APENAS o conteudo final do arquivo, sem explicacoes.', `Arquivo atual:\n\`\`\`\n${currentContent}\n\`\`\`\n\nModificacao a aplicar: ${content}\n\nRetorne o conteudo completo do arquivo apos a modificacao.`, []); newContent = editResult.content }
    updatePlanStep('3', 'done')

    updatePlanStep('4', 'running')
    if (!newContent || newContent.trim().length === 0) { updatePlanStep('4', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: 'Conteudo vazio' })); return 'Sandbox bloqueou o commit: conteudo vazio.' }
    updatePlanStep('4', 'done')

    updatePlanStep('5', 'running')
    const body = { message: commitMessage || 'feat: update via MORPHEUS', content: btoa(unescape(encodeURIComponent(newContent))), branch: 'main' }
    if (currentSha) body.sha = currentSha
    const commitRes = await githubFetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${filePath}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), context: { requiredScopes: ['repo'] } })
    if (!commitRes.ok) { updatePlanStep('5', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: commitRes.classified?.userMessage || `HTTP ${commitRes.status}` })); return commitRes.classified?.userMessage || `Erro ao commitar: ${commitRes.status}` }
    updatePlanStep('5', 'done')
    const commitUrl = commitRes.data?.content?.html_url || `https://github.com/${ghUser}/${repo}`
    setActiveToolCall(p => ({ ...p, status: 'done', result: `Commitado: ${filePath}` }))
    setTimeout(() => setActiveToolCall(null), 3000)
    return `Commit realizado com sucesso!\n\nArquivo: \`${filePath}\`\nRepositorio: ${repo}\nCommit: ${commitMessage}\n${commitUrl}`
  }

  // ---- LISTAR REPOS ----
  if (/list[aei]r?\s+(repo|reposit)|quais?\s+(s[aãe]o|sao)\s+(meus?\s+)?(repo|reposit)/i.test(text)) {
    setPlanSteps([{ id: '1', title: 'Conectar ao GitHub', status: 'running' },{ id: '2', title: 'Buscar repositorios', status: 'pending' },{ id: '3', title: 'Formatar lista', status: 'pending' }])
    setPlanVisible(true); setActiveToolCall({ name: 'github_list_repos', input: { user: ghUser }, status: 'running', result: null })
    updatePlanStep('1', 'done'); updatePlanStep('2', 'running')
    try {
      const result = await githubFetch('https://api.github.com/user/repos?per_page=100&sort=updated')
      if (!result.ok) { const c = result.classified; updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: c?.userMessage || `HTTP ${result.status}` })); return c?.userMessage || `Erro GitHub: ${result.status}` }
      const repos = result.data; updatePlanStep('2', 'done'); updatePlanStep('3', 'running')
      const output = repos.slice(0, 20).map(r => `- **${r.name}** (${r.language || 'sem linguagem'}, ${r.private ? 'PRIVADO' : 'PUBLICO'}) — ${r.description || 'sem descricao'}`).join('\n')
      updatePlanStep('3', 'done'); setActiveToolCall(p => ({ ...p, status: 'done', result: `${repos.length} repos encontrados` }))
      setTimeout(() => setActiveToolCall(null), 2000); return output
    } catch(e) { updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: e.message })); return `Erro: ${e.message}` }
  }

  // ---- LER ARQUIVO ----
  if (/l[eê]i[ao]?\s+|ler\s+|read\s+file|ver\s+(o\s+)?(arquivo|conteudo)/i.test(text)) {
    const repo = resolveRepo(text, registry) || 'morpheus-app'
    const fileMatch = text.match(/[\w\-\/]+\.[\w]+/); const filePath = fileMatch ? fileMatch[0] : 'README.md'
    setPlanSteps([{ id: '1', title: `Conectar ao repo ${repo}`, status: 'running' },{ id: '2', title: `Ler ${filePath}`, status: 'pending' },{ id: '3', title: 'Decodificar conteudo', status: 'pending' }])
    setPlanVisible(true); setActiveToolCall({ name: 'github_read_file', input: { repo, file: filePath }, status: 'running', result: null })
    updatePlanStep('1', 'done'); updatePlanStep('2', 'running')
    try {
      const result = await githubFetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${filePath}`, { context: { requiredScopes: ['repo'] } })
      if (!result.ok) {
        const c = result.classified
        if (c?.action === 'INVESTIGATE') { addThinkingStep('Investigando causa do erro...'); const investigation = await investigateNotFound(repo, filePath, ghToken, ghUser); clearThinkingSteps(); updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: investigation.diagnosis })); return investigation.message }
        updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: c?.userMessage || `HTTP ${result.status}` })); return c?.userMessage || `Erro ao ler ${filePath}: ${result.status}`
      }
      const data = result.data; updatePlanStep('2', 'done'); updatePlanStep('3', 'running')
      let content = ''; try { content = atob(data.content.replace(/\n/g, '')) } catch { content = data.content }
      updatePlanStep('3', 'done'); setActiveToolCall(p => ({ ...p, status: 'done', result: `${content.length} caracteres` }))
      setTimeout(() => setActiveToolCall(null), 2000)
      return `**Arquivo:** \`${filePath}\`\n**Repositorio:** ${repo}\n\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``
    } catch(e) { updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: e.message })); return `Erro: ${e.message}` }
  }

  // ---- LISTAR ARQUIVOS ----
  if (/list[aei]r?\s+(arquivo|files|estrutura|pasta|src|components|pages)|quais?\s+(s[aãe]o|sao)\s+(os\s+)?(arquivo|files|estrutura)/i.test(text)) {
    const repo = resolveRepo(text, registry) || 'morpheus-app'
    const pathMatch = text.match(/pasta\s+(\S+)|(src|components|pages|lib|hooks|utils)/i); const path = pathMatch ? (pathMatch[1] || pathMatch[2] || '') : ''
    setPlanSteps([{ id: '1', title: `Acessar ${repo}`, status: 'running' },{ id: '2', title: `Listar ${path || 'raiz'}`, status: 'pending' }])
    setPlanVisible(true); setActiveToolCall({ name: 'github_list_files', input: { repo, path: path || '/' }, status: 'running', result: null })
    updatePlanStep('1', 'done'); updatePlanStep('2', 'running')
    try {
      const result = await githubFetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { context: { requiredScopes: ['repo'] } })
      if (!result.ok) {
        const c = result.classified
        if (c?.action === 'INVESTIGATE') { addThinkingStep('Investigando causa do erro...'); const investigation = await investigateNotFound(repo, path, ghToken, ghUser); clearThinkingSteps(); updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: investigation.diagnosis })); return investigation.message }
        updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: c?.userMessage || `HTTP ${result.status}` })); return c?.userMessage || `Erro: ${result.status}`
      }
      const files = result.data; updatePlanStep('2', 'done')
      const list = (Array.isArray(files) ? files : [files]).map(f => `${f.type === 'dir' ? 'FOLDER' : 'FILE'} \`${f.name}\``).join('\n')
      setActiveToolCall(p => ({ ...p, status: 'done', result: `${(Array.isArray(files)?files:[files]).length} itens` }))
      setTimeout(() => setActiveToolCall(null), 2000)
      return `**Estrutura de** \`${repo}/${path}\`:\n\n${list}`
    } catch(e) { updatePlanStep('2', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: e.message })); return `Erro: ${e.message}` }
  }

  // ---- CLIMA ----
  if (/(clima|temperatura|tempo\s+em|como\s+est[aá]\s+o\s+(tempo|clima))/i.test(text)) {
    const cityMatch = text.match(/em\s+([A-ZÀ-\xda][a-zà-\xfa\s]+)/i); const city = cityMatch?.[1]?.trim() || settings.preferred_city || 'Xanxere'
    const apiKey = integrations.openweather?.key || ''
    if (!apiKey) return 'Configure OpenWeather API key em Configuracoes > Integracoes'
    setPlanSteps([{ id: '1', title: `Buscar clima: ${city}`, status: 'running' }]); setPlanVisible(true)
    setActiveToolCall({ name: 'get_weather', input: { city }, status: 'running', result: null })
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=pt_br`)
      const data = await res.json(); updatePlanStep('1', res.ok ? 'done' : 'failed')
      if (!res.ok) { setActiveToolCall(p => ({ ...p, status: 'failed', result: data.message })); return `Erro clima: ${data.message}` }
      const result = `SUN **${city}:** ${Math.round(data.main.temp)}C — ${data.weather[0].description}\nSensacao: ${Math.round(data.main.feels_like)}C | Umidade: ${data.main.humidity}%`
      setActiveToolCall(p => ({ ...p, status: 'done', result: `${Math.round(data.main.temp)}C` })); setTimeout(() => setActiveToolCall(null), 2000); return result
    } catch(e) { updatePlanStep('1', 'failed'); setActiveToolCall(p => ({ ...p, status: 'failed', result: e.message })); return `Erro: ${e.message}` }
  }

  // ---- CALCULO ----
  if (/(calcul|quanto\s+[eé]|\d+\s*[\+\-\*\/]\s*\d)/i.test(text)) {
    const expr = text.match(/[\d\s\+\-\*\/\(\)\.]+/)?.[0]?.trim()
    if (expr?.length > 2) {
      try { const result = Function(`'use strict'; return (${expr})`)(); setPlanSteps([{ id: '1', title: `Calcular: ${expr.trim()}`, status: 'done' }]); setPlanVisible(true); setTimeout(() => { setPlanVisible(false); setPlanSteps([]) }, 2000); return `CALC \`${expr.trim()} = **${result}**\`` } catch {}
    }
  }

  return null
}

export default function Morpheus() {
  const { user, session, authState, signOut } = useAuth()
  const kokoro = useKokoroTTS()
  const voiceLiveOptions = useMemo(() => ({ language: 'pt-BR' }), [])
  const voiceLive = useVoiceLive(voiceLiveOptions)

  const [tabs, setTabs] = useState([{ ...DEFAULT_TAB }])
  const [activeTabId, setActiveTabId] = useState('tab-1')
  const [isLoading, setIsLoading] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [combatMode, setCombatMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showObservability, setShowObservability] = useState(false)
  const [showBiometric, setShowBiometric] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [deviceChallenge, setDeviceChallenge] = useState(null)
  const [showResetPassword, setShowResetPassword] = useState(() => localStorage.getItem('morpheus_password_recovery') === 'true')

  const [planSteps, setPlanSteps] = useState([])
  const [planVisible, setPlanVisible] = useState(false)
  const [activeToolCall, setActiveToolCall] = useState(null)

  function updatePlanStep(id, status) { setPlanSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s)) }
  function clearPlan() { setTimeout(() => { setPlanVisible(false); setPlanSteps([]) }, 2000) }

  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('morpheus_settings')) || def() } catch { return def() }
    function def() { return { assistant_name: 'MORPHEUS', user_name: 'Jadiel', preferred_city: 'Xanxere/SC', language: 'pt-BR', tts_engine: 'auto', kokoro_voice: 'af_nicole', voice_speed: 1.0, ai_model: 'auto', sarcasm_level: 30, voice_enabled: true } }
  })

  const [evolution, setEvolution] = useState(() => loadEvolutionProfile(user?.id || 'local'))
  const [memory, setMemory] = useState(() => loadUserMemory(user?.id || 'local'))
  const messagesEndRef = useRef(null)
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activeTab?.messages])

  useEffect(() => {
    if (authState === 'authenticated') {
      kairos.start()
      const onUserAction = () => kairos.recordUserAction()
      window.addEventListener('keydown', onUserAction, { passive: true })
      window.addEventListener('mousemove', onUserAction, { passive: true })
      window.addEventListener('touchstart', onUserAction, { passive: true })
      window.addEventListener('click', onUserAction, { passive: true })
      return () => { kairos.stop(); window.removeEventListener('keydown', onUserAction); window.removeEventListener('mousemove', onUserAction); window.removeEventListener('touchstart', onUserAction); window.removeEventListener('click', onUserAction) }
    }
  }, [authState])

  useEffect(() => {
    if (authState === 'authenticated' && user) { registerSession(); const deviceId = getDeviceId(); if (!isDeviceTrusted(deviceId)) { getIpInfo().then(ipInfo => setDeviceChallenge({ deviceId, label: getDeviceLabel(), ...ipInfo })) } }
  }, [authState, user])

  useEffect(() => {
    if (user) {
      supabase.from('user_settings').select('memory_facts, memory_summary, user_name, preferred_city, integrations').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          if (data.memory_facts?.length) { const mem = loadUserMemory(user.id); const merged = { ...mem, facts: [...mem.facts, ...data.memory_facts].slice(-50) }; setMemory(merged) }
          if (data.user_name || data.preferred_city) { setSettings(prev => ({ ...prev, user_name: data.user_name || prev.user_name, preferred_city: data.preferred_city || prev.preferred_city })) }
          if (data.integrations && Object.keys(data.integrations).length > 0) { localStorage.setItem('morpheus_integrations', JSON.stringify(data.integrations)); sessionStorage.setItem('morpheus_integrations', JSON.stringify(data.integrations)) }
        }
      }).catch(() => {})
    }
  }, [user])

  useEffect(() => { migrateOldKeys() }, [])
  useEffect(() => { if (user) { syncRepoRegistry() } }, [user])
  useEffect(() => {
    const pingBackend = async () => {
      try {
        await fetch(`${apiBaseUrl}/api/health`, {
          method: 'GET',
          cache: 'no-store',
        })
      } catch (error) {
        console.warn('[MORPHEUS] Keep-alive falhou:', error)
      }
    }

    pingBackend()
    const intervalId = setInterval(pingBackend, KEEP_ALIVE_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [apiBaseUrl])

  const updateSettings = useCallback((patch) => { setSettings(prev => { const next = { ...prev, ...patch }; localStorage.setItem('morpheus_settings', JSON.stringify(next)); return next }) }, [])

  const addStep = useCallback((text) => setThinkingSteps(prev => [...prev, { id: generateId(), text, status: 'running' }]), [])
  const completeLastStep = useCallback((result) => setThinkingSteps(prev => { const n = [...prev]; if (n.length) n[n.length-1] = { ...n[n.length-1], status: 'done', result }; return n }), [])
  const clearSteps = useCallback(() => setTimeout(() => setThinkingSteps([]), 2000), [])
  const addThinkingStep = useCallback((text) => setThinkingSteps(prev => [...prev, { id: generateId(), text, status: 'running' }]), [])
  const clearThinkingSteps = useCallback(() => setThinkingSteps([]), [])

  const saveConversation = useCallback(async (tab) => {
    if (!user || tab.messages.length === 0) return
    try { await supabase.from('conversations').upsert({ id: tab.id, user_id: user.id, title: tab.title || tab.messages[0]?.content?.slice(0, 40) || 'Nova Conversa', messages: tab.messages, last_message_at: Date.now(), updated_at: new Date().toISOString() }) } catch (err) { console.error('[saveConversation] Erro:', err) }
  }, [user])

  const loadConversations = useCallback(async () => {
    if (!user) return []
    try { const { data } = await supabase.from('conversations').select('id, title, last_message_at, messages').eq('user_id', user.id).order('last_message_at', { ascending: false }).limit(50); return data || [] } catch (err) { console.error('[loadConversations] Erro:', err); return [] }
  }, [user])

  const createTab = useCallback(() => { const t = { id: 'tab-' + Date.now(), title: 'Nova Conversa', messages: [] }; setTabs(prev => [...prev, t]); setActiveTabId(t.id) }, [])
  const closeTab = useCallback((id) => setTabs(prev => { if (prev.length <= 1) return prev; const n = prev.filter(t => t.id !== id); if (activeTabId === id) setActiveTabId(n[n.length-1].id); return n }), [activeTabId])
  const updateActiveTab = useCallback((updater) => setTabs(prev => prev.map(t => t.id === activeTabId ? updater(t) : t)), [activeTabId])

  const callAI = useCallback(async (systemPrompt, userText, history = []) => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem('morpheus_settings') || '{}') } catch { return {} } })()
    const integrations = (() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()
    const selectedModel = settings.ai_model || stored.ai_model || 'auto'
    const groqKey = integrations.groq?.key || stored.groq_api_key || ''
    const openrouterKey = integrations.openrouter?.key || stored.openrouter_api_key || ''
    const claudeKey = integrations.claude?.key || stored.claude_api_key || ''
    const openaiKey = integrations.openai?.key || stored.openai_api_key || ''
    const deepseekKey = integrations.deepseek?.key || stored.deepseek_api_key || ''
    const geminiKey = integrations.gemini?.key || stored.gemini_api_key || ''
    const isValidKey = (k) => k && k.length > 10 && k !== 'sk-...'
    const hasAnyKey = [groqKey, openrouterKey, claudeKey, openaiKey, deepseekKey, geminiKey].some(isValidKey)
    const selectedModelLabel = {
      auto: 'Auto',
      groq_llama: 'Groq Llama 3.3 70B',
      groq_mixtral: 'Groq Mixtral 8x7B',
      anthropic_claude_sonnet: 'Claude 3.5 Sonnet',
      claude: 'Claude 3.5 Sonnet',
      openrouter_deepseek: 'DeepSeek R1 (OpenRouter)',
      openrouter_qwen: 'Qwen Coder (OpenRouter)',
      openrouter_qwen_coder: 'Qwen Coder (OpenRouter)',
      openrouter_glm: 'GLM-4 (OpenRouter)',
      google_gemini_flash: 'Gemini Flash (Google)',
      openai_gpt4o: 'OpenAI GPT-4o Mini',
    }[selectedModel] || selectedModel

    const chamarClaude = async () => {
      if (!isValidKey(claudeKey)) return null
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 2048, system: systemPrompt, messages: [...history.slice(-10), { role: 'user', content: userText }] }),
        })
        if (res.ok) {
          const d = await res.json()
          return { content: d.content?.[0]?.text || 'Sem resposta', model: 'claude-3-5-sonnet-20241022' }
        }
      } catch (e) { console.warn('[callAI] Claude falhou:', e) }
      return null
    }

    const chamarOpenAI = async () => {
      if (!isValidKey(openaiKey)) return null
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048 }),
        })
        if (res.ok) {
          const d = await res.json()
          return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: 'gpt-4o-mini' }
        }
      } catch (e) { console.warn('[callAI] OpenAI falhou:', e) }
      return null
    }

    const chamarGemini = async () => {
      if (!isValidKey(geminiKey)) return null
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userText }] }] }),
        })
        if (res.ok) {
          const d = await res.json()
          return { content: d.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta', model: 'gemini-2.0-flash' }
        }
      } catch (e) { console.warn('[callAI] Gemini falhou:', e) }
      return null
    }

    const chamarOpenRouter = async (selected) => {
      if (!isValidKey(openrouterKey)) return null
      try {
        const modelMap = {
          openrouter_deepseek: 'deepseek/deepseek-r1',
          openrouter_qwen: 'qwen/qwen-2.5-coder-32b-instruct',
          openrouter_qwen_coder: 'qwen/qwen-2.5-coder-32b-instruct',
          openrouter_glm: 'thudm/glm-4-9b',
          auto: 'qwen/qwen-2.5-coder-32b-instruct',
        }
        const modelName = modelMap[selected] || modelMap.auto
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}`, 'HTTP-Referer': window.location.origin },
          body: JSON.stringify({ model: modelName, messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048 }),
        })
        if (res.ok) {
          const d = await res.json()
          return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: modelName }
        }
      } catch (e) { console.warn('[callAI] OpenRouter falhou:', e) }
      return null
    }

    const chamarGroq = async (modelo = 'llama-3.3-70b-versatile') => {
      if (!isValidKey(groqKey)) return null
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048, temperature: 0.7 }),
        })
        if (res.ok) {
          const d = await res.json()
          return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: modelo }
        }
      } catch (e) { console.warn('[callAI] Groq falhou:', e) }
      return null
    }

    const apiKeys = {
      groq: groqKey,
      openrouter: openrouterKey,
      claude: claudeKey,
      anthropic: claudeKey,
      openai: openaiKey,
      deepseek: deepseekKey,
      gemini: geminiKey,
      google: geminiKey,
      github: integrations.github?.token || '',
      vercel: integrations.vercel?.token || '',
    }

    if (session?.access_token) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [...history.slice(-10), { role: 'user', content: userText }],
            apiKeys,
            model: selectedModel,
            conversationId: activeTabId,
          }),
        })

        if (response.ok && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let finalContent = ''
          let usedModel = selectedModel

          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const chunks = buffer.split('\n\n')
            buffer = chunks.pop() || ''

            for (const chunk of chunks) {
              const eventMatch = chunk.match(/event:\s*(.+)/)
              const dataMatch = chunk.match(/data:\s*([\s\S]+)/)
              const eventType = eventMatch?.[1]?.trim()
              const data = dataMatch ? JSON.parse(dataMatch[1]) : {}

              if (eventType === 'error') {
                throw new Error(data.message || 'Falha no backend')
              }

              if (eventType === 'content') {
                finalContent = data.content || finalContent
                usedModel = data.model || usedModel
              }
            }
          }

          if (finalContent) {
            return { content: finalContent, model: usedModel }
          }
        }
      } catch (e) {
        console.warn('[callAI] Backend falhou, tentando fallback direto:', e)
      }
    }

    if (selectedModel === 'anthropic_claude_sonnet' || selectedModel === 'claude') {
      const resultado = await chamarClaude()
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível do Anthropic.`, model: 'error' }
    }

    if (selectedModel === 'openai_gpt4o') {
      const resultado = await chamarOpenAI()
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível da OpenAI.`, model: 'error' }
    }

    if (selectedModel === 'google_gemini_flash') {
      const resultado = await chamarGemini()
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível do Google Gemini.`, model: 'error' }
    }

    if (selectedModel === 'openrouter_deepseek' || selectedModel === 'openrouter_qwen' || selectedModel === 'openrouter_qwen_coder' || selectedModel === 'openrouter_glm') {
      const resultado = await chamarOpenRouter(selectedModel)
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível do OpenRouter.`, model: 'error' }
    }

    if (selectedModel === 'groq_mixtral') {
      const resultado = await chamarGroq('mixtral-8x7b-32768')
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível da Groq.`, model: 'error' }
    }

    if (selectedModel === 'groq_llama') {
      const resultado = await chamarGroq('llama-3.3-70b-versatile')
      if (resultado) return resultado
      if (hasAnyKey) return { content: `[MORPHEUS] O modelo selecionado (${selectedModelLabel}) exige uma API key compatível da Groq.`, model: 'error' }
    }

    if (selectedModel === 'auto') {
      const resultado =
        await chamarClaude() ||
        await chamarOpenAI() ||
        await chamarOpenRouter('auto') ||
        await chamarGemini() ||
        await chamarGroq('llama-3.3-70b-versatile')

      if (resultado) return resultado
    }

    if (!hasAnyKey) {
      return { content: '[MORPHEUS] Nenhum LLM configurado. Va em Configuracoes > Integracoes e adicione qualquer API key suportada: Anthropic, OpenAI, OpenRouter, Google Gemini ou Groq.', model: 'none' }
    }

    return { content: `[MORPHEUS] Nao foi possivel usar o modelo selecionado (${selectedModelLabel}) com as credenciais atuais.`, model: 'error' }
  }, [apiBaseUrl, session, settings.ai_model, activeTabId])

  const handleSend = useCallback(async (text, files = [], fromVoice = false) => {
    kairos.recordUserAction()
    if (!text?.trim() && (!files || files.length === 0)) return
    const userMsg = { role: 'user', content: text, timestamp: Date.now(), files: files?.map(f => ({ name: f.name, type: f.type })) }
    updateActiveTab(tab => { const updated = { ...tab, messages: [...tab.messages, userMsg] }; if (tab.messages.length === 0) updated.title = truncate(text, 40); return updated })
    setIsLoading(true)

    const toolResult = await detectAndExecuteTool(text, { setPlanSteps, updatePlanStep, setPlanVisible, setActiveToolCall, addThinkingStep, clearThinkingSteps, callAI })
    if (toolResult !== null) {
      addStep('Formatando resposta...')
      try {
        let formatted = `**Resultado:**\n\n${toolResult}`
        try {
          const formattedResult = await callAI(
            'Voce e MORPHEUS. Apresente dados de forma clara e organizada em portugues.',
            `O usuario pediu: "${text}"\n\nDados obtidos:\n${toolResult}\n\nApresente estes dados de forma clara, organizada e util em portugues.`,
            [],
          )
          formatted = formattedResult.content || formatted
        } catch {}
        completeLastStep('Resposta pronta')
        const assistantMsg = { role: 'assistant', content: formatted, timestamp: Date.now(), model: settings.ai_model || 'auto' }
        updateActiveTab(tab => { const updated = { ...tab, messages: [...tab.messages, assistantMsg] }; if (user) saveConversation(updated); return updated })
      } catch (err) { const errMsg = { role: 'assistant', content: 'Erro: ' + (err.message || 'Falha desconhecida'), timestamp: Date.now(), model: 'error' }; updateActiveTab(tab => ({ ...tab, messages: [...tab.messages, errMsg] })) }
      finally { setIsLoading(false); clearSteps(); clearPlan() }
      return
    }

    addStep('Analisando mensagem...')
    const mentionedRepo = resolveRepoFromMessage(text)
    if (mentionedRepo) { addStep('Repo detectado: ' + mentionedRepo.name) }
    try {
      const updatedMemory = processAndSaveMemory(text, user?.id || 'local', memory); setMemory(updatedMemory)
      if (user) saveMemoryToSupabase(user.id, updatedMemory.facts, supabase)
      const memoryPrompt = buildMemoryPrompt(updatedMemory)
      const { updated: newEvo } = incrementMessageCount(user?.id || 'local', evolution); setEvolution(newEvo)
      const styleLayer = buildStyleLayer(newEvo, {})
      const sentiment = analyzeSentiment(text); const archetype = selectArchetype(text, settings.sarcasm_level || 30, newEvo.messageCount)
      const personalityLayer = buildPersonalityLayer(archetype, settings.sarcasm_level, combatMode, sentiment)
      const agent = routeToAgent(text); completeLastStep(agent ? 'Agente: ' + agent.name : 'Modo geral')
      let searchContext = ''
      if (shouldAutoSearch(text)) { addStep('Buscando na web...'); const results = await webSearch(text, 3); searchContext = formatSearchResults(results); completeLastStep(results.length + ' resultados') }
      const systemPrompt = buildAgentSystemPrompt(agent?.key || null, personalityLayer + '\n' + styleLayer, settings.language, settings.user_name, memoryPrompt)
      const fullPrompt = searchContext ? text + '\n\n[DADOS ATUAIS DA WEB]\n' + searchContext : text
      const content = buildContentWithAttachments(fullPrompt, files)
      const history = activeTab.messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      addStep('Chamando LLM (Groq primario)...')
      const result = await callAI(systemPrompt, typeof content === 'string' ? content : content.map(p => p.type === 'text' ? p.text : '').join('\n'), history)
      completeLastStep('Modelo: ' + (result.model || 'unknown'))
      const assistantMsg = { role: 'assistant', content: result.content, timestamp: Date.now(), model: result.model }
      updateActiveTab(tab => { const updated = { ...tab, messages: [...tab.messages, assistantMsg] }; saveConversation(updated); return updated })
      if (!fromVoice && settings.tts_engine !== 'disabled') { setIsSpeaking(true); speak(result.content, settings, kokoro).finally(() => setIsSpeaking(false)) }
    } catch (err) { const errMsg = { role: 'assistant', content: 'Erro: ' + (err.message || 'Falha desconhecida'), timestamp: Date.now(), model: 'error' }; updateActiveTab(tab => ({ ...tab, messages: [...tab.messages, errMsg] })) }
    finally { setIsLoading(false); clearSteps() }
  }, [activeTab, user, memory, evolution, settings, combatMode, kokoro, callAI, addStep, completeLastStep, clearSteps, updateActiveTab, saveConversation])

  const handleSpeak = useCallback(async (text) => { setIsSpeaking(true); try { await speak(text, settings, kokoro) } finally { setIsSpeaking(false) } }, [settings, kokoro])
  const handleRegenerate = useCallback(() => { const msgs = activeTab.messages; if (msgs.length < 2) return; const lastUser = [...msgs].reverse().find(m => m.role === 'user'); if (lastUser) { updateActiveTab(tab => ({ ...tab, messages: tab.messages.slice(0, -1) })); handleSend(lastUser.content) } }, [activeTab, handleSend, updateActiveTab])

  if (authState === 'loading') return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><div className="ldrs-helix" /></div>
  if (authState === 'unauthenticated') return <LoginScreen onLoggedIn={() => window.location.reload()} />
  if (showSplash) return <SplashScreen onStart={() => setShowSplash(false)} />

  return (
    <div className="morpheus-layout bg-dark-bg relative">
      <HudOverlay />
      <CombatModeBar active={combatMode} />
      <ProtocolHeader protocolId="NEBUCHADNEZZAR v1.0" onOpenSettings={() => setShowBiometric(true)} onOpenHistory={() => setShowHistory(true)} onOpenObservability={() => setShowObservability(true)} combatMode={combatMode} onSignOut={() => signOut()} />
      <ConversationTabs tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onCreate={createTab} />
      <DeployMonitor />
      <div className="morpheus-messages">
        {activeTab.messages.length === 0 ? <WelcomeMessage userName={settings.user_name || 'Jadiel'} onQuickCommand={(cmd) => handleSend(cmd)} /> : activeTab.messages.map((msg, i) => <MessageBubble key={i} message={msg} isSpeaking={isSpeaking} onSpeak={handleSpeak} onRegenerate={handleRegenerate} />)}
        {planVisible && <AgentPlannerPanel steps={planSteps} activeToolCall={activeToolCall} visible={planVisible} />}
        {isLoading && !planVisible && <ThinkingStatus steps={thinkingSteps} isLoading={isLoading} />}
        <ThinkingStatus steps={thinkingSteps} isLoading={isLoading} />
        <div ref={messagesEndRef} />
      </div>
      <div className="morpheus-input-bar">
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          isListening={false}
          onToggleMic={() => {}}
          isSpeaking={isSpeaking}
          isLiveVoice={voiceLive.isLive}
          onToggleLive={() => voiceLive.isLive ? voiceLive.stop() : voiceLive.start()}
          selectedModel={settings.ai_model || 'auto'}
          onChangeModel={(value) => updateSettings({ ai_model: value })}
        />
      </div>
      {showSettings && <SettingsPanel key={'settings-' + Date.now()} settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} initialIntegrations={(() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()} />}
      {showHistory && <ConversationHistory onClose={() => setShowHistory(false)} onLoad={() => setShowHistory(false)} />}
      {showObservability && <ObservabilityPanel onClose={() => setShowObservability(false)} />}
      {showBiometric && <BiometricGate onSuccess={() => { setShowBiometric(false); setShowSettings(true) }} onCancel={() => setShowBiometric(false)} />}
      {deviceChallenge && <NewDeviceChallenge deviceInfo={deviceChallenge} onTrust={() => { trustDevice(deviceChallenge.deviceId); setDeviceChallenge(null) }} onBlock={() => { window.location.href = '/SecurityBlock' }} />}
      {showResetPassword && <ResetPasswordModal onClose={() => { localStorage.removeItem('morpheus_password_recovery'); setShowResetPassword(false) }} />}
    </div>
  )
}
