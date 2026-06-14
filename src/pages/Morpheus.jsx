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

// Imports normais (sem lazy) para isolar o problema
import { SettingsPanel } from '../components/morpheus/SettingsPanel'
import { ConversationHistory } from '../components/morpheus/ConversationHistory'
import { DeployMonitor } from '../components/morpheus/DeployMonitor'
import { ObservabilityPanel } from '../components/morpheus/ObservabilityPanel'

const DEFAULT_TAB = { id: 'tab-1', title: 'Nova Conversa', messages: [] }

// Bug 1.5: Migracao de chaves antigas (flat -> nested)
function migrateOldKeys() {
  try {
    const migrated = localStorage.getItem('morpheus_keys_migrated')
    if (migrated) return
    const old = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    let changed = false
    // Mapeia chaves flat antigas para a nova estrutura aninhada
    const migrations = {
      'groq_key': 'groq.key',
      'openrouter_key': 'openrouter.key',
      'deepseek_key': 'deepseek.key',
      'gemini_key': 'gemini.key',
      'openai_key': 'openai.key',
      'claude_key': 'claude.key',
      'github_token': 'github.token',
      'github_username': 'github.username',
      'github_repos': 'github.repos',
      'vercel_token': 'vercel.token',
      'vercel_project_id': 'vercel.projectId',
      'vercel_team_id': 'vercel.teamId',
      'supabase_url': 'supabase.url',
      'supabase_anon_key': 'supabase.anonKey',
      'supabase_service_key': 'supabase.serviceKey',
      'brave_key': 'brave.api_key',
      'openweather_key': 'openweather.key',
      'elevenlabs_key': 'elevenlabs.key',
      'resend_key': 'resend.key',
      'alert_email': 'alerts.email',
      'alert_phone': 'alerts.phone',
    }
    for (const [oldKey, newPath] of Object.entries(migrations)) {
      if (old[oldKey] && !getNestedLocal(old, newPath)) {
        old[newPath] = old[oldKey]
        delete old[oldKey]
        changed = true
      }
    }
    if (changed) {
      localStorage.setItem('morpheus_integrations', JSON.stringify(old))
      console.log('[MORPHEUS] Chaves migradas do formato flat para aninhado')
    }
    localStorage.setItem('morpheus_keys_migrated', 'true')
  } catch (e) { console.warn('[MORPHEUS] Erro na migracao:', e) }
}

function getNestedLocal(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj)
}

// Task 2.2: Sincroniza registry de repos em background
async function syncRepoRegistry() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.github?.token
    if (!token) return
    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const repos = await res.json()
    const registry = repos.map(r => ({
      name: r.name, full_name: r.full_name, url: r.html_url,
      private: r.private, language: r.language, updated: r.updated_at,
      description: r.description,
    }))
    localStorage.setItem('morpheus_repo_registry', JSON.stringify(registry))
    console.log(`[MORPHEUS] Registry sincronizado: ${registry.length} repos`)
  } catch (e) { console.warn('[MORPHEUS] Falha ao sincronizar registry:', e) }
}

// Task 2.3: Resolve repositorio mencionado no texto
function resolveRepoFromMessage(text) {
  try {
    const registry = JSON.parse(localStorage.getItem('morpheus_repo_registry') || '[]')
    if (!registry.length) return null
    for (const repo of registry) {
      const patterns = [
        repo.name.toLowerCase(),
        repo.name.toLowerCase().replace(/-/g, ' '),
        repo.name.toLowerCase().split('-')[0],
      ]
      for (const pattern of patterns) {
        if (pattern.length > 2 && text.toLowerCase().includes(pattern)) {
          return repo
        }
      }
    }
    return null
  } catch { return null }
}

export default function Morpheus() {
  const { user, authState, signOut } = useAuth()
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
  const [showResetPassword, setShowResetPassword] = useState(
    () => localStorage.getItem('morpheus_password_recovery') === 'true'
  )

  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('morpheus_settings')) || def() } catch { return def() }
    function def() { return { assistant_name: 'MORPHEUS', user_name: 'Jadiel', preferred_city: 'Xanxere/SC', language: 'pt-BR', tts_engine: 'auto', kokoro_voice: 'af_nicole', voice_speed: 1.0, ai_model: 'auto', sarcasm_level: 30, voice_enabled: true } }
  })

  const [evolution, setEvolution] = useState(() => loadEvolutionProfile(user?.id || 'local'))
  const [memory, setMemory] = useState(() => loadUserMemory(user?.id || 'local'))
  const messagesEndRef = useRef(null)
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activeTab?.messages])

  useEffect(() => {
    if (authState === 'authenticated') {
      kairos.start()
      const onUserAction = () => kairos.recordUserAction()
      window.addEventListener('keydown',    onUserAction, { passive: true })
      window.addEventListener('mousemove',  onUserAction, { passive: true })
      window.addEventListener('touchstart', onUserAction, { passive: true })
      window.addEventListener('click',      onUserAction, { passive: true })
      return () => {
        kairos.stop()
        window.removeEventListener('keydown',    onUserAction)
        window.removeEventListener('mousemove',  onUserAction)
        window.removeEventListener('touchstart', onUserAction)
        window.removeEventListener('click',      onUserAction)
      }
    }
  }, [authState])

  useEffect(() => {
    if (authState === 'authenticated' && user) {
      registerSession()
      const deviceId = getDeviceId()
      if (!isDeviceTrusted(deviceId)) {
        getIpInfo().then(ipInfo => setDeviceChallenge({ deviceId, label: getDeviceLabel(), ...ipInfo }))
      }
    }
  }, [authState, user])

  // Carrega memoria E integracoes do Supabase no inicio da sessao
  useEffect(() => {
    if (user) {
      supabase
        .from('user_settings')
        .select('memory_facts, memory_summary, user_name, preferred_city, integrations')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            if (data.memory_facts?.length) {
              const mem = loadUserMemory(user.id)
              const merged = { ...mem, facts: [...mem.facts, ...data.memory_facts].slice(-50) }
              setMemory(merged)
            }
            if (data.user_name || data.preferred_city) {
              setSettings(prev => ({
                ...prev,
                user_name: data.user_name || prev.user_name,
                preferred_city: data.preferred_city || prev.preferred_city,
              }))
            }
            // TAREFA 3.3: Carrega integracoes do Supabase (fonte de verdade)
            if (data.integrations && Object.keys(data.integrations).length > 0) {
              localStorage.setItem('morpheus_integrations', JSON.stringify(data.integrations))
              sessionStorage.setItem('morpheus_integrations', JSON.stringify(data.integrations))
              console.log('[MORPHEUS] Integrations loaded from Supabase:', Object.keys(data.integrations).join(', '))
            }
          }
        })
        .catch(() => {})
    }
  }, [user])

  // Bug 1.5: Migracao de chaves antigas ao iniciar
  useEffect(() => { migrateOldKeys() }, [])

  // Task 2.2: Sincroniza repo registry ao iniciar (background)
  useEffect(() => {
    if (user) { syncRepoRegistry() }
  }, [user])

  const updateSettings = useCallback((patch) => {
    setSettings(prev => { const next = { ...prev, ...patch }; localStorage.setItem('morpheus_settings', JSON.stringify(next)); return next })
  }, [])

  const addStep = useCallback((text) => setThinkingSteps(prev => [...prev, { id: generateId(), text, status: 'running' }]), [])
  const completeLastStep = useCallback((result) => setThinkingSteps(prev => { const n = [...prev]; if (n.length) n[n.length-1] = { ...n[n.length-1], status: 'done', result }; return n }), [])
  const clearSteps = useCallback(() => setTimeout(() => setThinkingSteps([]), 2000), [])

  const saveConversation = useCallback(async (tab) => {
    if (!user || tab.messages.length === 0) return
    try {
      const title = tab.title || tab.messages[0]?.content?.slice(0, 40) || 'Nova Conversa'
      await supabase.from('conversations').upsert({
        id: tab.id,
        user_id: user.id,
        title,
        messages: tab.messages,
        last_message_at: Date.now(),
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[saveConversation] Erro:', err)
    }
  }, [user])

  const loadConversations = useCallback(async () => {
    if (!user) return []
    try {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, last_message_at, messages')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(50)
      return data || []
    } catch (err) {
      console.error('[loadConversations] Erro:', err)
      return []
    }
  }, [user])

  const createTab = useCallback(() => { const t = { id: 'tab-' + Date.now(), title: 'Nova Conversa', messages: [] }; setTabs(prev => [...prev, t]); setActiveTabId(t.id) }, [])
  const closeTab = useCallback((id) => setTabs(prev => { if (prev.length <= 1) return prev; const n = prev.filter(t => t.id !== id); if (activeTabId === id) setActiveTabId(n[n.length-1].id); return n }), [activeTabId])
  const updateActiveTab = useCallback((updater) => setTabs(prev => prev.map(t => t.id === activeTabId ? updater(t) : t)), [activeTabId])

  const callAI = useCallback(async (systemPrompt, userText, history = []) => {
    // Sempre lê do localStorage — garante keys mais recentes
    const stored = (() => { try { return JSON.parse(localStorage.getItem('morpheus_settings') || '{}') } catch { return {} } })()
    const integrations = (() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()

    // Lê chaves aninhadas: groq.key, openrouter.key, claude.key, openai.key, deepseek.key, gemini.key
    const groqKey       = integrations.groq?.key       || stored.groq_api_key       || ''
    const openrouterKey = integrations.openrouter?.key  || stored.openrouter_api_key  || ''
    const claudeKey     = integrations.claude?.key      || stored.claude_api_key     || ''
    const openaiKey     = integrations.openai?.key      || stored.openai_api_key     || ''
    const deepseekKey   = integrations.deepseek?.key    || stored.deepseek_api_key   || ''
    const geminiKey     = integrations.gemini?.key      || stored.gemini_api_key     || ''

    const isValidKey = (k) => k && k.length > 10 && k !== 'sk-...'

    // Tentativa 1: Groq (primário)
    if (isValidKey(groqKey)) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048, temperature: 0.7 })
        })
        if (res.ok) { const d = await res.json(); return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: 'groq/llama-3.3-70b' } }
      } catch (e) { console.warn('[callAI] Groq falhou:', e) }
    }

    // Tentativa 2: Claude (Anthropic)
    if (isValidKey(claudeKey)) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 2048, system: systemPrompt, messages: [...history.slice(-10), { role: 'user', content: userText }] })
        })
        if (res.ok) { const d = await res.json(); return { content: d.content?.[0]?.text || 'Sem resposta', model: 'claude-3.5-sonnet' } }
      } catch (e) { console.warn('[callAI] Claude falhou:', e) }
    }

    // Tentativa 3: OpenAI
    if (isValidKey(openaiKey)) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048 })
        })
        if (res.ok) { const d = await res.json(); return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: 'openai/gpt-4o-mini' } }
      } catch (e) { console.warn('[callAI] OpenAI falhou:', e) }
    }

    // Tentativa 4: OpenRouter
    if (isValidKey(openrouterKey)) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}`, 'HTTP-Referer': window.location.origin },
          body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048 })
        })
        if (res.ok) { const d = await res.json(); return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: 'openrouter/llama-3.3-70b' } }
      } catch (e) { console.warn('[callAI] OpenRouter falhou:', e) }
    }

    // Tentativa 5: DeepSeek
    if (isValidKey(deepseekKey)) {
      try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: userText }], max_tokens: 2048 })
        })
        if (res.ok) { const d = await res.json(); return { content: d.choices?.[0]?.message?.content || 'Sem resposta', model: 'deepseek/deepseek-chat' } }
      } catch (e) { console.warn('[callAI] DeepSeek falhou:', e) }
    }

    // Tentativa 6: Gemini
    if (isValidKey(geminiKey)) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userText }] }] })
        })
        if (res.ok) { const d = await res.json(); return { content: d.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta', model: 'gemini/2.0-flash' } }
      } catch (e) { console.warn('[callAI] Gemini falhou:', e) }
    }

    return { content: '[MORPHEUS] Nenhum LLM configurado. Va em Configuracoes > Integracoes e adicione sua GROQ API Key (gratuita em console.groq.com).', model: 'none' }
  }, [])

  const handleSend = useCallback(async (text, files = [], fromVoice = false) => {
    kairos.recordUserAction()
    if (!text?.trim() && (!files || files.length === 0)) return

    const userMsg = { role: 'user', content: text, timestamp: Date.now(), files: files?.map(f => ({ name: f.name, type: f.type })) }
    updateActiveTab(tab => {
      const updated = { ...tab, messages: [...tab.messages, userMsg] }
      if (tab.messages.length === 0) updated.title = truncate(text, 40)
      return updated
    })

    setIsLoading(true)
    addStep('Analisando mensagem...')

    // Task 2.3: Resolve repositorio mencionado no texto
    const mentionedRepo = resolveRepoFromMessage(text)
    if (mentionedRepo) {
      addStep('Repo detectado: ' + mentionedRepo.name)
    }

    try {
      const updatedMemory = processAndSaveMemory(text, user?.id || 'local', memory)
      setMemory(updatedMemory)
      // Salva no Supabase tambem
      if (user) saveMemoryToSupabase(user.id, updatedMemory.facts, supabase)
      const memoryPrompt = buildMemoryPrompt(updatedMemory)

      const { updated: newEvo } = incrementMessageCount(user?.id || 'local', evolution)
      setEvolution(newEvo)
      const styleLayer = buildStyleLayer(newEvo, {})

      const sentiment = analyzeSentiment(text)
      const archetype = selectArchetype(text, settings.sarcasm_level || 30, newEvo.messageCount)
      const personalityLayer = buildPersonalityLayer(archetype, settings.sarcasm_level, combatMode, sentiment)

      const agent = routeToAgent(text)
      completeLastStep(agent ? 'Agente: ' + agent.name : 'Modo geral')

      let searchContext = ''
      if (shouldAutoSearch(text)) {
        addStep('Buscando na web...')
        const results = await webSearch(text, 3)
        searchContext = formatSearchResults(results)
        completeLastStep(results.length + ' resultados')
      }

      const systemPrompt = buildAgentSystemPrompt(agent?.key || null, personalityLayer + '\n' + styleLayer, settings.language, settings.user_name, memoryPrompt)
      const fullPrompt = searchContext ? text + '\n\n[DADOS ATUAIS DA WEB]\n' + searchContext : text
      const content = buildContentWithAttachments(fullPrompt, files)
      const history = activeTab.messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

      addStep('Chamando LLM (Groq primario)...')
      const result = await callAI(systemPrompt, typeof content === 'string' ? content : content.map(p => p.type === 'text' ? p.text : '').join('\n'), history)
      completeLastStep('Modelo: ' + (result.model || 'unknown'))

      const assistantMsg = { role: 'assistant', content: result.content, timestamp: Date.now(), model: result.model }
      updateActiveTab(tab => {
        const updated = { ...tab, messages: [...tab.messages, assistantMsg] }
        // Salva no Supabase apos cada resposta
        saveConversation(updated)
        return updated
      })

      if (!fromVoice && settings.tts_engine !== 'disabled') {
        setIsSpeaking(true)
        speak(result.content, settings, kokoro).finally(() => setIsSpeaking(false))
      }
    } catch (err) {
      const errMsg = { role: 'assistant', content: 'Erro: ' + (err.message || 'Falha desconhecida'), timestamp: Date.now(), model: 'error' }
      updateActiveTab(tab => ({ ...tab, messages: [...tab.messages, errMsg] }))
    } finally {
      setIsLoading(false)
      clearSteps()
    }
  }, [activeTab, user, memory, evolution, settings, combatMode, kokoro, callAI, addStep, completeLastStep, clearSteps, updateActiveTab, saveConversation])

  const handleSpeak = useCallback(async (text) => { setIsSpeaking(true); try { await speak(text, settings, kokoro) } finally { setIsSpeaking(false) } }, [settings, kokoro])

  const handleRegenerate = useCallback(() => {
    const msgs = activeTab.messages; if (msgs.length < 2) return
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    if (lastUser) { updateActiveTab(tab => ({ ...tab, messages: tab.messages.slice(0, -1) })); handleSend(lastUser.content) }
  }, [activeTab, handleSend, updateActiveTab])

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
        {activeTab.messages.length === 0
          ? <WelcomeMessage
              userName={settings.user_name || 'Jadiel'}
              onQuickCommand={(cmd) => handleSend(cmd)}
            />
          : activeTab.messages.map((msg, i) => <MessageBubble key={i} message={msg} isSpeaking={isSpeaking} onSpeak={handleSpeak} onRegenerate={handleRegenerate} />)
        }
        <ThinkingStatus steps={thinkingSteps} isLoading={isLoading} />
        <div ref={messagesEndRef} />
      </div>
      <div className="morpheus-input-bar">
        <ChatInput onSend={handleSend} isLoading={isLoading} isListening={false} onToggleMic={() => {}} isSpeaking={isSpeaking} isLiveVoice={voiceLive.isLive} onToggleLive={() => voiceLive.isLive ? voiceLive.stop() : voiceLive.start()} />
      </div>
      {showSettings && <SettingsPanel
        key={'settings-' + Date.now()}
        settings={settings}
        onUpdate={updateSettings}
        onClose={() => setShowSettings(false)}
        initialIntegrations={(() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()}
      />}
      {showHistory && <ConversationHistory onClose={() => setShowHistory(false)} onLoad={() => setShowHistory(false)} />}
      {showObservability && <ObservabilityPanel onClose={() => setShowObservability(false)} />}
      {showBiometric && <BiometricGate onSuccess={() => { setShowBiometric(false); setShowSettings(true) }} onCancel={() => setShowBiometric(false)} />}
      {deviceChallenge && <NewDeviceChallenge deviceInfo={deviceChallenge} onTrust={() => { trustDevice(deviceChallenge.deviceId); setDeviceChallenge(null) }} onBlock={() => { window.location.href = '/SecurityBlock' }} />}
      {showResetPassword && <ResetPasswordModal onClose={() => {
        localStorage.removeItem('morpheus_password_recovery')
        setShowResetPassword(false)
      }} />}
    </div>
  )
}
