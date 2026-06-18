import { useState, createContext, useContext, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/authContext'
import { supabase } from '../../lib/supabaseClient'
import { useKokoroTTS } from './useKokoroTTS'
import { KokoroDownloadManager } from './KokoroDownloadManager'
import { testGitHubTokenScopes } from '../../lib/errorHandler'
const TABS = ['Perfil', 'Voz', 'IA', 'Integracoes', 'Seguranca']

function normalizeApiKey(value) {
  return String(value || '').trim()
}

async function testarProviderIA(apiBaseUrl, accessToken, provider, key) {
  const normalizedKey = normalizeApiKey(key)
  if (!accessToken) return { ok: false, message: 'Sessao ausente para validar credenciais via backend.' }
  if (!normalizedKey || normalizedKey.length < 10) return { ok: false, message: 'Key vazia ou muito curta apos normalizacao.' }

  try {
    const response = await fetch(`${apiBaseUrl}/api/credentials/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ provider, key: normalizedKey }),
    })

    const text = await response.text()
    let payload = {}
    try { payload = text ? JSON.parse(text) : {} } catch { payload = { message: text } }

    return {
      ok: Boolean(payload.ok),
      warning: Boolean(payload.warning),
      code: payload.status || response.status,
      message: payload.message || (response.ok ? 'Autenticacao validada com sucesso.' : `Falha ao validar ${provider}.`),
    }
  } catch (error) {
    return { ok: false, message: `Erro de rede ao validar ${provider} via backend: ${error.message}` }
  }
}

const IntegrationsContext = createContext(null)
const STORAGE_KEY = 'morpheus_integrations'

// ===== Persistencia dupla localStorage + sessionStorage =====
function saveIntegrations(data) {
  const json = JSON.stringify(data)
  try { localStorage.setItem(STORAGE_KEY, json); sessionStorage.setItem(STORAGE_KEY, json) }
  catch(e) { console.error('[STORAGE] Save error:', e) }
}

function loadIntegrations() {
  try {
    const local = localStorage.getItem(STORAGE_KEY)
    if (local && local !== '{}' && local !== 'null' && local.length > 2) {
      const p = JSON.parse(local)
      if (Object.keys(p).length > 0) return p
    }
    const session = sessionStorage.getItem(STORAGE_KEY)
    if (session && session !== '{}' && session.length > 2) {
      const p = JSON.parse(session)
      if (Object.keys(p).length > 0) { localStorage.setItem(STORAGE_KEY, session); return p }
    }
  } catch(e) { console.error('[STORAGE] Load error:', e) }
  return {}
}

function getNested(obj, path) { return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj) }

function setNested(obj, path, value) {
  const keys = path.split('.'); const result = { ...obj }; let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') current[keys[i]] = {}
    else current[keys[i]] = { ...current[keys[i]] }
    current = current[keys[i]]
  }
  current[keys[keys.length - 1]] = value; return result
}

export function SettingsPanel({ settings, onUpdate, onClose, initialIntegrations }) {
  const { user, session } = useAuth()
  const kokoroHook = useKokoroTTS()
  const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin
  const [activeTab, setActiveTab] = useState('Perfil')
  const [saveStatus, setSaveStatus] = useState('')
  const [testingVoice, setTestingVoice] = useState(false)

  // Estado centralizado de integracoes com dupla persistencia
  const [integrations, setIntegrations] = useState(() => {
    const fp = initialIntegrations && Object.keys(initialIntegrations).length > 0
    return fp ? initialIntegrations : loadIntegrations()
  })

  useEffect(() => {
    console.log('[DEBUG] SettingsPanel mounted. localStorage:', (localStorage.getItem(STORAGE_KEY) || 'VAZIO').slice(0, 80))
  }, [])

  const [localSettings, setLocalSettings] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('morpheus_settings') || '{}')
      return { assistant_name:'MORPHEUS',user_name:'Jadiel',preferred_city:'Xanxere/SC',language:'pt-BR',tts_engine:'kokoro',kokoro_voice:'af_nicole',voice_speed:1.0,ai_model:'auto',sarcasm_level:30,...stored,...settings }
    } catch { return { assistant_name:'MORPHEUS',user_name:'Jadiel',preferred_city:'Xanxere/SC',language:'pt-BR',tts_engine:'kokoro',kokoro_voice:'af_nicole',voice_speed:1.0,ai_model:'auto',sarcasm_level:30,...settings } }
  })

  const updateLocal = (patch) => { setLocalSettings(prev => { const n = { ...prev, ...patch }; localStorage.setItem('morpheus_settings', JSON.stringify(n)); return n }); onUpdate(patch) }

  // handleSave com persistencia tripla
  const handleSave = async () => {
    localStorage.setItem('morpheus_settings', JSON.stringify(localSettings))
    saveIntegrations(integrations)
    let synced = false
    if (user) {
      try {
        const { error } = await supabase.from('user_settings').upsert({
          id: user.id, user_name: localSettings.user_name, user_email: user.email,
          preferred_city: localSettings.preferred_city, integrations: integrations,
          updated_at: new Date().toISOString(),
        })
        if (!error) synced = true
      } catch(e) { console.error('[Supabase] Save error:', e) }
    }
    setSaveStatus(synced ? 'SALVO E SINCRONIZADO' : 'SALVO LOCALMENTE')
    setTimeout(() => setSaveStatus(''), 3000)
  }

  const handleTestVoice = async () => {
    setTestingVoice(true)
    try { await kokoroHook.speak('Ola Jadiel. MORPHEUS online. Sistemas operacionais.', localSettings.kokoro_voice || 'af_nicole', localSettings.voice_speed || 1.0) }
    catch(err) { console.warn('[TestVoice]', err.message) }
    finally { setTestingVoice(false) }
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
            <KokoroDownloadManager onDownloadComplete={() => {}} onSkip={() => {}} />
            <div><label className="text-xs opacity-60">Motor TTS</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.tts_engine || 'kokoro'} onChange={e => updateLocal({ tts_engine: e.target.value })}><option value="kokoro">Kokoro (Local/Gratuito)</option><option value="elevenlabs">ElevenLabs (Premium)</option><option value="disabled">Desativado</option></select></div>
            <div><label className="text-xs opacity-60">Voz Kokoro</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.kokoro_voice || 'af_nicole'} onChange={e => updateLocal({ kokoro_voice: e.target.value })}><option value="af_nicole">Nicole (US Female)</option><option value="af_bella">Bella (US Female)</option><option value="af_sarah">Sarah (US Female)</option><option value="af_sky">Sky (US Female)</option><option value="am_adam">Adam (US Male)</option><option value="am_michael">Michael (US Male)</option><option value="bf_emma">Emma (UK Female)</option><option value="bf_isabella">Isabella (UK Female)</option><option value="bm_george">George (UK Male)</option><option value="bm_lewis">Lewis (UK Male)</option></select></div>
            {localSettings.tts_engine === 'elevenlabs' && <div><label className="text-xs opacity-60">ElevenLabs API Key</label><input type="password" className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.elevenlabs_api_key || ''} onChange={e => updateLocal({ elevenlabs_api_key: e.target.value })} placeholder="sk-..." /></div>}
            {localSettings.tts_engine === 'elevenlabs' && <div><label className="text-xs opacity-60">ElevenLabs Voice ID</label><input className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.elevenlabs_voice_id || ''} onChange={e => updateLocal({ elevenlabs_voice_id: e.target.value })} placeholder="Rachel" /></div>}
            <div><label className="text-xs opacity-60">Velocidade da Voz</label><input type="range" min="0.5" max="2" step="0.1" className="w-full mt-1" value={localSettings.voice_speed || 1.0} onChange={e => updateLocal({ voice_speed: parseFloat(e.target.value) })} /><span className="text-xs opacity-40">{localSettings.voice_speed || 1.0}x</span></div>
            <div style={{ marginTop: '16px' }}><button onClick={handleTestVoice} disabled={testingVoice} style={{ width:'100%',padding:'12px',background:testingVoice?'rgba(0,255,255,0.15)':'transparent',border:'1px solid rgba(0,255,255,0.3)',borderRadius:'8px',color:'#00FFFF',fontFamily:'monospace',fontSize:'13px',cursor:testingVoice?'not-allowed':'pointer',letterSpacing:'1px' }}>{testingVoice ? 'TOCANDO...' : 'TESTAR VOZ'}</button></div>
          </div>}
          {activeTab === 'IA' && <div className="space-y-4">
            <div><label className="text-xs opacity-60">Modelo AI</label><select className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan mt-1 font-mono" value={localSettings.ai_model || 'auto'} onChange={e => updateLocal({ ai_model: e.target.value })}><option value="auto">Auto (primeira chave valida disponível)</option><option value="groq_llama">Groq Llama 3.3 70B</option><option value="groq_mixtral">Groq Mixtral 8x7B</option><option value="anthropic_claude_sonnet">Claude Sonnet 4.5</option><option value="openrouter_deepseek">DeepSeek R1 (OpenRouter)</option><option value="openrouter_qwen">Qwen Coder (OpenRouter)</option><option value="openrouter_glm">GLM-4 (OpenRouter)</option><option value="google_gemini_flash">Gemini Flash (Google)</option><option value="openai_gpt4o">OpenAI GPT-4o</option></select></div>
            <div><label className="text-xs opacity-60">Nivel de Sarcasmo ({localSettings.sarcasm_level || 30}%)</label><input type="range" min="0" max="100" className="w-full mt-1" value={localSettings.sarcasm_level || 30} onChange={e => updateLocal({ sarcasm_level: parseInt(e.target.value) })} /></div>
          </div>}
          {activeTab === 'Integracoes' && <IntegrationsContext.Provider value={{ integrations, setIntegrations }}><div className="space-y-4">
            <IntegrationSection title="IA PROVIDERS">
              {[
                { key: 'groq', label: 'Groq API Key' },
                { key: 'openrouter', label: 'OpenRouter API Key (DeepSeek/Qwen/GLM-4)' },
                { key: 'gemini', label: 'Google Gemini API Key' },
                { key: 'openai', label: 'OpenAI API Key' },
                { key: 'claude', label: 'Anthropic API Key (Claude)' },
              ].map(({ key, label }) => (
                <IntegrationField key={key} label={label} placeholder="sk-..." storeKey={`${key}.key`}
                  testFn={(k) => testarProviderIA(apiBaseUrl, session?.access_token, key, k)}
                />
              ))}
            </IntegrationSection>
            <IntegrationSection title="GITHUB">
              <IntegrationField label="GitHub Token (PAT)" placeholder="ghp_..." storeKey="github.token"
                testFn={async(k)=>{const r=await testGitHubTokenScopes(k);return r.ok}}
                onTokenSaved={async(token)=>{if(!token||token.length<10)return;try{const[rr,ur]=await Promise.all([fetch('https://api.github.com/user/repos?per_page=100&sort=updated',{headers:{Authorization:`Bearer ${token}`}}),fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token}`}})]);if(rr.ok){const repos=await rr.json();const rn=repos.map(r=>r.name).join(', ');const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');s.github={...s.github,repos:rn};saveIntegrations(s);const reg=repos.map(r=>({name:r.name,full_name:r.full_name,url:r.html_url,private:r.private,language:r.language,updated:r.updated_at,description:r.description}));localStorage.setItem('morpheus_repo_registry',JSON.stringify(reg))}if(ur.ok){const ud=await ur.json();const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');s.github={...s.github,username:ud.login};saveIntegrations(s)}}catch(err){console.error('[GitHub]',err)}}}
              />
              <IntegrationField label="GitHub Username" placeholder="jadiel054" storeKey="github.username" noTest />
              <IntegrationField label="Repositorios (separados por virgula)" placeholder="morpheus-app, zarith-saas-web, vitabot" storeKey="github.repos" noTest />
            </IntegrationSection>
            <IntegrationSection title="VERCEL">
              <IntegrationField label="Vercel Token" placeholder="vcp_..." storeKey="vercel.token"
                testFn={async(k)=>{try{const r=await fetch('https://api.vercel.com/v2/user',{headers:{Authorization:`Bearer ${k}`}});return r.ok}catch{return false}}}
              />
              <IntegrationField label="Project ID" placeholder="prj_..." storeKey="vercel.projectId" noTest />
              <IntegrationField label="Team ID" placeholder="team_..." storeKey="vercel.teamId" noTest />
            </IntegrationSection>
            <IntegrationSection title="SUPABASE">
              <IntegrationField label="Supabase URL" placeholder="https://xxx.supabase.co" storeKey="supabase.url" noTest />
              <IntegrationField label="Supabase Anon Key" placeholder="eyJ..." storeKey="supabase.anonKey"
                testFn={async(k)=>{const ints=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}})();const url=getNested(ints,'supabase.url');if(!url)return false;try{const r=await fetch(url+'/rest/v1/',{headers:{apikey:k,Authorization:`Bearer ${k}`}});return r.status<500}catch{return false}}}
              />
              <IntegrationField label="Supabase Service Role Key (opcional)" placeholder="eyJ..." storeKey="supabase.serviceKey" noTest />
            </IntegrationSection>
            <IntegrationSection title="TELEGRAM — 10 BOTS">
              {['MorpheusComando','MorpheusAlerts','MorpheusDev','MorpheusDebugger','MorpheusAnalytics','MorpheusOps','MorpheusArchitect','MorpheusAuditor','MorpheusTrainer','MorpheusMemory'].map(bn => { const k=bn.toLowerCase(); return (
                <div key={bn} style={{ marginBottom:'14px',padding:'10px',background:'rgba(0,255,255,0.03)',borderRadius:'8px',border:'1px solid rgba(0,255,255,0.08)' }}>
                  <div style={{ color:'rgba(0,255,255,0.6)',fontSize:'11px',letterSpacing:'1px',marginBottom:'8px' }}>{bn}</div>
                  <IntegrationField label="Token" placeholder="123456:ABC-xxx" storeKey={`telegram.${k}.token`}
                    testFn={async(t)=>{try{const r=await fetch('https://api.telegram.org/bot'+t+'/getMe');const d=await r.json();return d.ok}catch{return false}}}
                  />
                  <IntegrationField label="Chat ID" placeholder="-1001234567890" storeKey={`telegram.${k}.chatId`} noTest />
                </div>
              )})}
            </IntegrationSection>
            <IntegrationSection title="OUTROS SERVICOS">
              <IntegrationField label="Resend API Key (emails de alerta)" placeholder="re_..." storeKey="resend.key"
                testFn={async(k)=>{try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${k}`,'Content-Type':'application/json'},body:JSON.stringify({from:'test@resend.dev',to:'test@test.com',subject:'test',html:'test'})});return r.status!==401}catch{return false}}}
              />
              <IntegrationField label="OpenRouteService API Key (rotas/distancias)" placeholder="5b3ce3..." storeKey="openrouteservice.key" noTest />
              <IntegrationField label="Email de alerta de seguranca" placeholder="jadiel@email.com" storeKey="alerts.email" noTest />
              <IntegrationField label="WhatsApp/SMS (numero para alertas)" placeholder="+5549999999999" storeKey="alerts.phone" noTest />
              <IntegrationField label="Brave Search API Key" placeholder="BSA..." storeKey="brave.api_key"
                testFn={async(k)=>{try{const r=await fetch('https://api.search.brave.com/res/v1/web/search?q=test',{headers:{'X-Subscription-Token':k}});return r.ok}catch{return false}}}
              />
              <IntegrationField label="OpenWeather API Key" placeholder="..." storeKey="openweather.key"
                testFn={async(k)=>{try{const r=await fetch('https://api.openweathermap.org/data/2.5/weather?q=Xanxere&appid='+k);return r.ok}catch{return false}}}
              />
              <IntegrationField label="ElevenLabs API Key" placeholder="sk-..." storeKey="elevenlabs.key"
                testFn={async(k)=>{try{const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':k}});return r.ok}catch{return false}}}
              />
            </IntegrationSection>
          </div></IntegrationsContext.Provider>}
          {activeTab === 'Seguranca' && <SegurancaTab user={user} settings={localSettings} updateLocal={updateLocal} />}
        </div>
        <div style={{ borderTop:'1px solid #0d2030',padding:'16px 24px',display:'flex',gap:'12px',background:'#0a1520' }}>
          <button onClick={handleSave} style={{ flex:1,padding:'12px',background:saveStatus?'rgba(0,255,255,0.3)':'#00FFFF',color:'#050a0f',border:'none',borderRadius:'8px',fontFamily:'monospace',fontWeight:'700',fontSize:'13px',letterSpacing:'1px',cursor:'pointer' }}>{saveStatus || 'SALVAR'}</button>
          <button onClick={onClose} style={{ padding:'12px 20px',background:'transparent',border:'1px solid rgba(0,255,255,0.2)',borderRadius:'8px',color:'rgba(0,255,255,0.6)',fontFamily:'monospace',fontSize:'13px',cursor:'pointer' }}>FECHAR</button>
        </div>
      </div>
    </div>
  )
}

function SegurancaTab({ user, settings, updateLocal }) {
  const [pin, setPin] = useState(() => localStorage.getItem('morpheus_emergency_pin') || '')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [emailConfirmed] = useState(() => user?.email_confirmed_at != null)
  const savePin = () => { localStorage.setItem('morpheus_emergency_pin', pin); alert('PIN salvo!') }
  const handleResetPassword = async () => { setResetting(true); try { const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin + '/?reset=true' }); setResetMsg(error ? 'Erro: ' + error.message : 'Link enviado para ' + user.email) } catch(err) { setResetMsg('Erro: ' + err.message) } setResetting(false); setTimeout(() => setResetMsg(''), 5000) }
  const handleResendConfirmation = async () => { try { const { error } = await supabase.auth.resend({ type: 'signup', email: user.email }); if (!error) alert('Email reenviado!'); else alert('Erro: ' + error.message) } catch(err) { alert('Erro: ' + err.message) } }
  const handleDeleteAccount = async () => { if (!window.confirm('Tem certeza? IRREVERSIVEL.')) return; if (window.prompt('Digite DELETE:') !== 'DELETE') return; try { await supabase.from('conversations').delete().eq('user_id', user.id); await supabase.from('morpheus_memory').delete().eq('user_id', user.id); await supabase.from('system_status').delete().eq('user_id', user.id); await supabase.from('user_settings').delete().eq('id', user.id); await supabase.auth.signOut(); window.location.reload() } catch(err) { alert('Erro: ' + err.message) } }
  const s = { marginBottom: '20px' }; const ts = { color: 'rgba(0,255,255,0.4)', fontSize: '10px', letterSpacing: '3px', marginBottom: '8px', borderBottom: '1px solid rgba(0,255,255,0.1)', paddingBottom: '6px' }
  const ds = { color: 'rgba(0,255,255,0.4)', fontSize: '11px', fontFamily: 'monospace', marginBottom: '8px', lineHeight: 1.5 }
  const ab = { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,255,255,0.2)', borderRadius: '8px', color: '#00FFFF', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', letterSpacing: '1px' }
  const is = { width: '100%', background: '#050a0f', border: '1px solid #0d2030', borderRadius: '8px', padding: '10px 12px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }
  return (<div style={{ display:'flex',flexDirection:'column',gap:'20px' }}>
    <div style={s}><div style={ts}>PIN DE EMERGENCIA</div><div style={{ display:'flex',gap:'8px' }}><input type="password" maxLength={6} placeholder="6 digitos" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} style={{ flex:1,...is }} /><button onClick={savePin} style={ab}>Salvar PIN</button></div></div>
    <div style={s}><div style={ts}>REDEFINIR SENHA</div><p style={ds}>Enviar link de redefinicao para o email da conta.</p><button onClick={handleResetPassword} disabled={resetting} style={ab}>{resetting?'Enviando...':'Enviar link de redefinicao'}</button>{resetMsg&&<p style={{ color:'#00FFFF',fontSize:'12px',fontFamily:'monospace',marginTop:'8px' }}>{resetMsg}</p>}</div>
    <div style={s}><div style={ts}>CONFIRMACAO DE EMAIL</div><p style={ds}>Status: {emailConfirmed?'Email confirmado':'Email nao confirmado'}</p>{!emailConfirmed&&<button onClick={handleResendConfirmation} style={ab}>Reenviar confirmacao</button>}</div>
    <div style={s}><div style={ts}>NOTIFICACOES DE SEGURANCA</div><ToggleRow label="Alertas por email (novo dispositivo, login suspeito)" value={settings.security_email_alerts} onChange={v => updateLocal({ security_email_alerts: v })} /><ToggleRow label="Alertas por WhatsApp/SMS" value={settings.security_sms_alerts} onChange={v => updateLocal({ security_sms_alerts: v })} /><p style={ds}>Configure na aba Integracoes &gt; Outros Servicos.</p></div>
    <div style={s}><div style={{ ...ts,color:'rgba(255,0,128,0.6)',borderBottomColor:'rgba(255,0,128,0.2)' }}>ZONA DE PERIGO</div><button onClick={handleDeleteAccount} style={{ ...ab,background:'rgba(255,0,128,0.1)',border:'1px solid rgba(255,0,128,0.3)',color:'#ff0080' }}>Excluir conta permanentemente</button></div>
  </div>)
}

function ToggleRow({ label, value, onChange }) {
  return (<div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0' }}><span style={{ color:'rgba(0,255,255,0.6)',fontSize:'11px',fontFamily:'monospace' }}>{label}</span><button onClick={() => onChange(!value)} style={{ width:'44px',height:'24px',borderRadius:'12px',border:'none',background:value?'#00FFFF':'rgba(0,255,255,0.15)',cursor:'pointer',position:'relative',transition:'background 0.2s' }}><div style={{ width:'18px',height:'18px',borderRadius:'50%',background:value?'#050a0f':'rgba(0,255,255,0.5)',position:'absolute',top:'3px',left:value?'23px':'3px',transition:'left 0.2s' }}/></button></div>)
}

function IntegrationSection({ title, children }) {
  return (<div style={{ marginBottom:'24px' }}><div style={{ color:'rgba(0,255,255,0.4)',fontSize:'10px',letterSpacing:'3px',marginBottom:'12px',borderBottom:'1px solid rgba(0,255,255,0.1)',paddingBottom:'6px' }}>{title}</div>{children}</div>)
}

function getNestedLocal(obj, path) { return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj) }

function setNestedLocal(obj, path, value) {
  const keys = path.split('.'); const result = JSON.parse(JSON.stringify(obj)); let current = result
  for (let i = 0; i < keys.length - 1; i++) { if (!current[keys[i]] || typeof current[keys[i]] !== 'object') current[keys[i]] = {}; current = current[keys[i]] }
  current[keys[keys.length - 1]] = value; return result
}

function IntegrationField({ label, placeholder, storeKey, testFn, noTest, onTokenSaved }) {
  const ctx = useContext(IntegrationsContext)
  const [value, setValue] = useState(() => {
    try {
      const source = (ctx?.integrations && Object.keys(ctx.integrations).length > 0) ? ctx.integrations : loadIntegrations()
      return getNestedLocal(source, storeKey)
    } catch { return '' }
  })
  const [testStatus, setTestStatus] = useState('')
  const [testDetail, setTestDetail] = useState(null)
  const isGithubToken = storeKey === 'github.token'
  const handleTest = async () => {
    const normalizedValue = normalizeApiKey(value)
    if (!normalizedValue || normalizedValue.length < 5) { setTestStatus('Vazia'); setTestDetail(null); return }
    setTestStatus('...'); setTestDetail(null)
    try {
      if (isGithubToken) {
        const detail = await testGitHubTokenScopes(normalizedValue)
        setTestDetail(detail)
        if (!detail.ok) setTestStatus('Invalida')
        else if (detail.warning) setTestStatus('OK*')
        else setTestStatus('OK')
      } else {
        const detail = await testFn(normalizedValue)
        const normalizedDetail = typeof detail === 'boolean'
          ? { ok: detail, message: detail ? 'Teste concluido com sucesso.' : 'Validacao falhou sem detalhe.' }
          : detail
        setTestDetail(normalizedDetail)
        if (!normalizedDetail.ok) setTestStatus(normalizedDetail.warning ? 'OK*' : 'Invalida')
        else if (normalizedDetail.warning) setTestStatus('OK*')
        else setTestStatus('OK')
      }
    } catch { setTestStatus('Erro') }
    setTimeout(() => { setTestStatus(''); setTestDetail(null) }, 8000)
  }
  const handleChange = (e) => {
    const newVal = e.target.value; setValue(newVal)
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const updated = setNestedLocal(stored, storeKey, newVal)
      saveIntegrations(updated)
      if (ctx?.setIntegrations) ctx.setIntegrations(updated)
      if (onTokenSaved && storeKey === 'github.token') onTokenSaved(newVal)
    } catch(err) { console.error('[IntegrationField]', err) }
  }
  return (<div style={{ marginBottom:'12px' }}>
    <div style={{ color:'rgba(0,255,255,0.6)',fontSize:'11px',letterSpacing:'1px',marginBottom:'6px' }}>{label}</div>
    <div style={{ display:'flex',gap:'8px' }}>
      <input type={storeKey.includes('key')||storeKey.includes('token')||storeKey.includes('Key')?'password':'text'} value={value} onChange={handleChange} placeholder={placeholder} style={{ flex:1,background:'#050a0f',border:'1px solid #0d2030',borderRadius:'8px',padding:'10px 12px',color:'#e2e8f0',fontFamily:'monospace',fontSize:'13px',outline:'none' }} />
      {!noTest&&<button onClick={handleTest} style={{ padding:'10px 12px',background:'transparent',border:'1px solid rgba(0,255,255,0.2)',borderRadius:'8px',color:testStatus==='OK'?'#00FFFF':testStatus==='OK*'?'orange':testStatus==='Invalida'?'#ff0080':'rgba(0,255,255,0.6)',fontFamily:'monospace',fontSize:'11px',cursor:'pointer',whiteSpace:'nowrap',minWidth:'70px' }}>{testStatus||'TESTAR'}</button>}
    </div>
    {testDetail && (
      <div style={{ marginTop:'8px',padding:'10px 12px',background:testDetail.warning?'rgba(255,165,0,0.1)':testDetail.ok?'rgba(0,255,255,0.08)':'rgba(255,0,128,0.08)',border:`1px solid ${testDetail.warning?'orange':testDetail.ok?'rgba(0,255,255,0.3)':'rgba(255,0,128,0.3)'}`,borderRadius:'8px',fontFamily:'monospace',fontSize:'11px',color:testDetail.warning?'orange':'#00FFFF',whiteSpace:'pre-wrap' }}>
        {testDetail.message}
      </div>
    )}
  </div>)
}
