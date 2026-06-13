import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/authContext'
import { supabase } from '../../lib/supabaseClient'
import { useKokoroTTS } from './useKokoroTTS'
import { KokoroDownloadManager } from './KokoroDownloadManager'
const TABS = ['Perfil', 'Voz', 'IA', 'Integracoes', 'Seguranca']

export function SettingsPanel({ settings, onUpdate, onClose }) {
  const { user } = useAuth()
  const kokoroHook = useKokoroTTS()
  const [activeTab, setActiveTab] = useState('Perfil')
  const [saved, setSaved] = useState(false)
  const [testingVoice, setTestingVoice] = useState(false)
  const [localSettings, setLocalSettings] = useState({ ...settings })
  const [integrations, setIntegrations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} }
  })
  const [testStatus, setTestStatus] = useState({})

  const updateLocal = (patch) => {
    setLocalSettings(prev => ({ ...prev, ...patch }))
    onUpdate(patch)
  }

  const handleSave = async () => {
    localStorage.setItem('morpheus_settings', JSON.stringify(localSettings))
    localStorage.setItem('morpheus_integrations', JSON.stringify(integrations))
    if (user) {
      try {
        await supabase.from('user_settings').upsert({
          id: user.id,
          user_name: localSettings.user_name,
          user_email: user.email,
          preferred_city: localSettings.preferred_city,
          updated_at: new Date().toISOString(),
        })
      } catch {}
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestVoice = async () => {
    setTestingVoice(true)
    try {
      await kokoroHook.speak(
        'Ola Jadiel. MORPHEUS online. Sistemas operacionais.',
        localSettings.kokoro_voice || 'af_nicole',
        localSettings.voice_speed || 1.0
      )
    } catch (err) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance('Ola Jadiel. MORPHEUS online.')
        utt.lang = 'pt-BR'
        window.speechSynthesis.speak(utt)
      }
    } finally {
      setTestingVoice(false)
    }
  }

  const testApiKey = async (provider, key) => {
    if (!key || key === 'sk-...') {
      setTestStatus(s => ({ ...s, [provider]: 'Vazia' }))
      return
    }
    setTestStatus(s => ({ ...s, [provider]: '...' }))

    const endpoints = {
      groq:        ['https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` }],
      openrouter:  ['https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${key}` }],
      openai:      ['https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }],
      elevenlabs:  ['https://api.elevenlabs.io/v1/voices', { 'xi-api-key': key }],
      openweather: [`https://api.openweathermap.org/data/2.5/weather?q=Xanxere&appid=${key}`, {}],
    }

    const [url, headers] = endpoints[provider] || []
    if (!url) return

    try {
      const res = await fetch(url, { headers })
      setTestStatus(s => ({ ...s, [provider]: res.ok ? 'OK' : 'Invalida' }))
    } catch {
      setTestStatus(s => ({ ...s, [provider]: 'Erro' }))
    }

    setTimeout(() => setTestStatus(s => ({ ...s, [provider]: '' })), 3000)
  }

  const inputStyle = {
    width: '100%',
    background: '#050a0f',
    border: '1px solid #0d2030',
    borderRadius: '6px',
    padding: '10px 12px',
    color: '#00FFFF',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-40 flex items-center justify-center p-4">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border"><h2 className="text-sm text-cyan font-bold">CONFIGURACOES</h2><button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button></div>
        <div className="flex border-b border-dark-border">{TABS.map(tab => <button key={tab} className={'settings-tab' + (activeTab === tab ? ' settings-tab--active' : '')} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'Perfil' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Nome do Assistente</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.assistant_name || 'MORPHEUS'} onChange={e => updateLocal({ assistant_name: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Nome do Usuario</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.user_name || 'Jadiel'} onChange={e => updateLocal({ user_name: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Cidade</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.preferred_city || 'Xanxere/SC'} onChange={e => updateLocal({ preferred_city: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Idioma</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.language || 'pt-BR'} onChange={e => updateLocal({ language: e.target.value })}><option value="pt-BR">Portugues (BR)</option><option value="en-US">English (US)</option></select></div>
          </div>}
          {activeTab === 'Voz' && <div className="space-y-4">
            <KokoroDownloadManager
              onDownloadComplete={() => {}}
              onSkip={() => {}}
            />
            <div><label className="text-xs opacity-60">Motor TTS</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.tts_engine || 'auto'} onChange={e => updateLocal({ tts_engine: e.target.value })}>
              <option value="auto">Auto (Kokoro + fallback Web Speech)</option>
              <option value="kokoro">Kokoro (Local/Gratuito)</option>
              <option value="elevenlabs">ElevenLabs (Premium)</option>
              <option value="webspeech">Web Speech API</option>
              <option value="disabled">Desativado</option>
            </select></div>
            <div><label className="text-xs opacity-60">Voz Kokoro</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.kokoro_voice || 'af_nicole'} onChange={e => updateLocal({ kokoro_voice: e.target.value })}>
              <option value="af_nicole">Nicole (US Female)</option>
              <option value="af_bella">Bella (US Female)</option>
              <option value="af_sarah">Sarah (US Female)</option>
              <option value="af_sky">Sky (US Female)</option>
              <option value="am_adam">Adam (US Male)</option>
              <option value="am_michael">Michael (US Male)</option>
              <option value="bf_emma">Emma (UK Female)</option>
              <option value="bf_isabella">Isabella (UK Female)</option>
              <option value="bm_george">George (UK Male)</option>
              <option value="bm_lewis">Lewis (UK Male)</option>
            </select></div>
            {localSettings.tts_engine === 'elevenlabs' && <div><label className="text-xs opacity-60">ElevenLabs API Key</label><input type="password" className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.elevenlabs_api_key || ''} onChange={e => updateLocal({ elevenlabs_api_key: e.target.value })} placeholder="sk-..." /></div>}
            {localSettings.tts_engine === 'elevenlabs' && <div><label className="text-xs opacity-60">ElevenLabs Voice ID</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.elevenlabs_voice_id || ''} onChange={e => updateLocal({ elevenlabs_voice_id: e.target.value })} placeholder="Rachel" /></div>}
            <div><label className="text-xs opacity-60">Velocidade da Voz</label><input type="range" min="0.5" max="2" step="0.1" className="w-full mt-1" value={localSettings.voice_speed || 1.0} onChange={e => updateLocal({ voice_speed: parseFloat(e.target.value) })} /><span className="text-xs opacity-40">{localSettings.voice_speed || 1.0}x</span></div>
            <div style={{ marginTop: '16px' }}>
              <button onClick={handleTestVoice} disabled={testingVoice} style={{
                width: '100%', padding: '12px',
                background: testingVoice ? 'rgba(0,255,255,0.15)' : 'transparent',
                border: '1px solid rgba(0,255,255,0.3)', borderRadius: '8px',
                color: '#00FFFF', fontFamily: 'monospace', fontSize: '13px',
                cursor: testingVoice ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
              }}>
                {testingVoice ? 'TOCANDO...' : 'TESTAR VOZ'}
              </button>
            </div>
          </div>}
          {activeTab === 'IA' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Modelo AI</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.ai_model || 'auto'} onChange={e => updateLocal({ ai_model: e.target.value })}><option value="auto">Auto (Groq primario)</option><option value="groq_llama">Groq Llama 3.3 70B</option><option value="groq_mixtral">Groq Mixtral 8x7B</option><option value="openrouter_qwen_coder">OpenRouter Qwen Coder</option><option value="openai_gpt4o">OpenAI GPT-4o</option><option value="claude">Claude 3.5 Sonnet</option></select></div>
            <div><label className="text-xs opacity-60">Nivel de Sarcasmo ({localSettings.sarcasm_level || 30}%)</label><input type="range" min="0" max="100" className="w-full mt-1" value={localSettings.sarcasm_level || 30} onChange={e => updateLocal({ sarcasm_level: parseInt(e.target.value) })} /></div>
          </div>}
          {activeTab === 'Integracoes' && <div className="space-y-4">
            {['groq','openrouter','deepseek','gemini','openai','claude','elevenlabs','openweather','brave'].map(key => (
              <div key={key}>
                <label className="text-xs opacity-60">{key.toUpperCase()} API Key</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <input type="password"
                    style={{ flex: 1, ...inputStyle }}
                    value={integrations[key + '_key'] || ''}
                    onChange={e => setIntegrations({...integrations, [key + '_key']: e.target.value})}
                    placeholder="sk-..." />
                  <button onClick={() => testApiKey(key, integrations[key + '_key'])}
                    style={{
                      padding: '10px 12px', background: 'transparent',
                      border: '1px solid rgba(0,255,255,0.3)', borderRadius: '8px',
                      color: '#00FFFF', fontFamily: 'monospace', fontSize: '11px',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    {testStatus[key] || 'TESTAR'}
                  </button>
                </div>
              </div>
            ))}
          </div>}
          {activeTab === 'Seguranca' && <div className="space-y-4"><div><label className="text-xs opacity-60">PIN de Emergencia (6 digitos)</label><input type="password" maxLength={6} className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono tracking-widest" defaultValue="123456" onChange={e => localStorage.setItem('morpheus_emergency_pin', e.target.value)} /></div><p className="text-xs opacity-40">WebAuthn / Biometria: configure no dispositivo.</p></div>}
        </div>

        <div style={{
          borderTop: '1px solid #0d2030',
          padding: '16px 24px',
          display: 'flex',
          gap: '12px',
          background: '#0a1520',
        }}>
          <button onClick={handleSave} style={{
            flex: 1, padding: '12px',
            background: saved ? 'rgba(0,255,255,0.3)' : '#00FFFF',
            color: '#050a0f',
            border: 'none', borderRadius: '8px',
            fontFamily: 'monospace', fontWeight: '700',
            fontSize: '13px', letterSpacing: '1px', cursor: 'pointer',
          }}>
            {saved ? 'SALVO!' : 'SALVAR'}
          </button>
          <button onClick={onClose} style={{
            padding: '12px 20px',
            background: 'transparent',
            border: '1px solid rgba(0,255,255,0.2)',
            borderRadius: '8px', color: 'rgba(0,255,255,0.6)',
            fontFamily: 'monospace', fontSize: '13px', cursor: 'pointer',
          }}>
            FECHAR
          </button>
        </div>
      </div>
    </div>
  )
}
