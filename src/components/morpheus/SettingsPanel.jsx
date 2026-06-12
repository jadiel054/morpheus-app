import { useState } from 'react'
import { X } from 'lucide-react'
const TABS = ['Perfil', 'Voz', 'IA', 'Integracoes', 'Seguranca']

export function SettingsPanel({ settings, onUpdate, onClose }) {
  const [activeTab, setActiveTab] = useState('Perfil')
  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-40 flex items-center justify-center p-4">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border"><h2 className="text-sm text-cyan font-bold">CONFIGURACOES</h2><button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button></div>
        <div className="flex border-b border-dark-border">{TABS.map(tab => <button key={tab} className={`settings-tab ${activeTab === tab ? 'settings-tab--active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'Perfil' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Nome do Assistente</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.assistant_name || 'MORPHEUS'} onChange={e => onUpdate({ assistant_name: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Nome do Usuario</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.user_name || 'Jadiel'} onChange={e => onUpdate({ user_name: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Cidade</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.preferred_city || 'Xanxere/SC'} onChange={e => onUpdate({ preferred_city: e.target.value })} /></div>
            <div><label className="text-xs opacity-60">Idioma</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.language || 'pt-BR'} onChange={e => onUpdate({ language: e.target.value })}><option value="pt-BR">Portugues (BR)</option><option value="en-US">English (US)</option></select></div>
          </div>}
          {activeTab === 'Voz' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Motor TTS</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.tts_engine || 'kokoro'} onChange={e => onUpdate({ tts_engine: e.target.value })}><option value="kokoro">Kokoro (Local/Gratuito)</option><option value="elevenlabs">ElevenLabs (Premium)</option><option value="webspeech">Web Speech API</option><option value="disabled">Desativado</option></select></div>
            <div><label className="text-xs opacity-60">Velocidade da Voz</label><input type="range" min="0.5" max="2" step="0.1" className="w-full mt-1" value={settings.voice_speed || 1.0} onChange={e => onUpdate({ voice_speed: parseFloat(e.target.value) })} /><span className="text-xs opacity-40">{settings.voice_speed || 1.0}x</span></div>
          </div>}
          {activeTab === 'IA' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Modelo AI</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings.ai_model || 'auto'} onChange={e => onUpdate({ ai_model: e.target.value })}><option value="auto">Auto (Groq primario)</option><option value="groq_llama">Groq Llama 3.3 70B</option><option value="groq_mixtral">Groq Mixtral 8x7B</option><option value="openrouter_qwen_coder">OpenRouter Qwen Coder</option><option value="openai_gpt4o">OpenAI GPT-4o</option><option value="claude">Claude 3.5 Sonnet</option></select></div>
            <div><label className="text-xs opacity-60">Nivel de Sarcasmo ({settings.sarcasm_level || 30}%)</label><input type="range" min="0" max="100" className="w-full mt-1" value={settings.sarcasm_level || 30} onChange={e => onUpdate({ sarcasm_level: parseInt(e.target.value) })} /></div>
          </div>}
          {activeTab === 'Integracoes' && <div className="space-y-4">{['groq','openrouter','deepseek','gemini','openai','claude','elevenlabs','openweather','brave'].map(key => <div key={key}><label className="text-xs opacity-60">{key.toUpperCase()} API Key</label><input type="password" className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={settings[key + '_api_key'] || ''} onChange={e => onUpdate({ [key + '_api_key']: e.target.value })} placeholder="sk-..." /></div>)}</div>}
          {activeTab === 'Seguranca' && <div className="space-y-4"><div><label className="text-xs opacity-60">PIN de Emergencia (6 digitos)</label><input type="password" maxLength={6} className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono tracking-widest" defaultValue="123456" onChange={e => localStorage.setItem('morpheus_emergency_pin', e.target.value)} /></div><p className="text-xs opacity-40">WebAuthn / Biometria: configure no dispositivo.</p></div>}
        </div>
      </div>
    </div>
  )
}
