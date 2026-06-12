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
import { generateId, truncate } from '../lib/utils'
import { speak } from '../lib/ttsDispatcher'
import { useKokoroTTS } from '../components/morpheus/useKokoroTTS'
import { useVoiceLive } from '../components/morpheus/useVoiceLive'
import { routeToAgent } from '../components/morpheus/agents/agentRouter'
import { buildAgentSystemPrompt } from '../components/morpheus/agents/agentPrompts'
import { processAndSaveMemory, buildMemoryPrompt, loadUserMemory } from '../components/morpheus/agents/memoryEngine'
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

  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('morpheus_settings')) || def() } catch { return def() }
    function def() { return { assistant_name: 'MORPHEUS', user_name: 'Jadiel', preferred_city: 'Xanxere/SC', language: 'pt-BR', tts_engine: 'auto', kokoro_voice: 'af_nicole', voice_speed: 1.0, ai_model: 'auto', sarcasm_level: 30 } }
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

  const updateSettings = useCallback((patch) => {
    setSettings(prev => { const next = { ...prev, ...patch }; localStorage.setItem('morpheus_settings', JSON.stringify(next)); return next })
  }, [])

  const addStep = useCallback((text) => setThinkingSteps(prev => [...prev, { id: generateId(), text, status: 'running' }]), [])
  const completeLastStep = useCallback((result) => setThinkingSteps(prev => { const n = [...prev]; if (n.length) n[n.length-1] = { ...n[n.length-1], status: 'done', result }; return n }), [])
  const clearSteps = useCallback(() => setTimeout(() => setThinkingSteps([]), 2000), [])

  const createTab = useCallback(() => { const t = { id: 'tab-' + Date.now(), title: 'Nova Conversa', messages: [] }; setTabs(prev => [...prev, t]); setActiveTabId(t.id) }, [])
  const closeTab = useCallback((id) => setTabs(prev => { if (prev.length <= 1) return prev; const n = prev.filter(t => t.id !== id); if (activeTabId === id) setActiveTabId(n[n.length-1].id); return n }), [activeTabId])
  const updateActiveTab = useCallback((updater) => setTabs(prev => prev.map(t => t.id === activeTabId ? updater(t) : t)), [activeTabId])

  const callAI = useCallback(async (systemPrompt, userText, history = []) => {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl) {
      try {
        const res = await fetch(apiUrl + '/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (user?.access_token || '') },
          body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userText }], apiKeys: { groq: settings.groq_api_key }, model: settings.ai_model || 'auto' })
        })
        if (res.ok) { const d = await res.json(); return { content: d.content, model: d.model || 'groq/llama-3.3-70b' } }
      } catch {}
    }
    if (settings.groq_api_key) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.groq_api_key },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userText }], max_tokens: 4096, temperature: 0.7 })
        })
        if (res.ok) { const d = await res.json(); return { content: d.choices?.[0]?.message?.content || '', model: 'groq/llama-3.3-70b' } }
      } catch {}
    }
    return { content: '[MORPHEUS] Nenhum LLM disponivel. Configure uma API key nas Configuracoes.', model: 'none' }
  }, [settings, user])

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

    try {
      const updatedMemory = processAndSaveMemory(text, user?.id || 'local', memory)
      setMemory(updatedMemory)
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
      updateActiveTab(tab => ({ ...tab, messages: [...tab.messages, assistantMsg] }))

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
  }, [activeTab, user, memory, evolution, settings, combatMode, kokoro, callAI, addStep, completeLastStep, clearSteps, updateActiveTab])

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
    <div className="h-full flex flex-col bg-dark-bg relative">
      <HudOverlay />
      <CombatModeBar active={combatMode} />
      <ProtocolHeader protocolId="NEBUCHADNEZZAR v1.0" onOpenSettings={() => setShowBiometric(true)} onOpenHistory={() => setShowHistory(true)} onOpenObservability={() => setShowObservability(true)} combatMode={combatMode} onSignOut={() => signOut()} />
      <ConversationTabs tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onCreate={createTab} />
      <DeployMonitor />
      <div className="flex-1 overflow-y-auto">
        {activeTab.messages.map((msg, i) => <MessageBubble key={i} message={msg} isSpeaking={isSpeaking} onSpeak={handleSpeak} onRegenerate={handleRegenerate} />)}
        <ThinkingStatus steps={thinkingSteps} isLoading={isLoading} />
        <div ref={messagesEndRef} />
      </div>
      <ChatInput onSend={handleSend} isLoading={isLoading} isListening={false} onToggleMic={() => {}} isSpeaking={isSpeaking} isLiveVoice={voiceLive.isLive} onToggleLive={() => voiceLive.isLive ? voiceLive.stop() : voiceLive.start()} />
      {showSettings && <SettingsPanel settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} />}
      {showHistory && <ConversationHistory onClose={() => setShowHistory(false)} onLoad={() => setShowHistory(false)} />}
      {showObservability && <ObservabilityPanel onClose={() => setShowObservability(false)} />}
      {showBiometric && <BiometricGate onSuccess={() => { setShowBiometric(false); setShowSettings(true) }} onCancel={() => setShowBiometric(false)} />}
      {deviceChallenge && <NewDeviceChallenge deviceInfo={deviceChallenge} onTrust={() => { trustDevice(deviceChallenge.deviceId); setDeviceChallenge(null) }} onBlock={() => { window.location.href = '/SecurityBlock' }} />}
    </div>
  )
}
