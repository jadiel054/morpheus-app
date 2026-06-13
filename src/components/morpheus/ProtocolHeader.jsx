import { useState, useEffect } from 'react'
import { Settings, History, Activity, Zap, LogOut } from 'lucide-react'

export function ProtocolHeader({ protocolId = 'NEBUCHADNEZZAR v1.0', onOpenSettings, onOpenHistory, onOpenObservability, combatMode, onSignOut }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      background: '#050a0f',
      borderBottom: '1px solid #0d2030',
      height: '60px',
      width: '100%',
      boxSizing: 'border-box',
      overflow: 'hidden',
      gap: '8px',
    }}>
      {/* Logo/Status */}
      <div style={{ flexShrink: 0, minWidth: 0 }}>
        <div style={{
          fontSize: '9px', fontFamily: 'monospace',
          color: 'rgba(0,255,255,0.7)', letterSpacing: '1px',
          lineHeight: 1.3,
        }}>
          <div>NEBUCHADNEZZAR</div>
          <div>V1.0 // SYSTEM</div>
          <div style={{ color: '#00FFFF' }}>ONLINE</div>
        </div>
      </div>

      {/* Relogio */}
      <div style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace',
        fontSize: '14px', color: '#00FFFF', letterSpacing: '1px', minWidth: 0 }}>
        {time.toLocaleTimeString('pt-BR')}
      </div>

      {/* Botoes */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button onClick={onOpenObservability} style={headerBtnStyle} title="Observabilidade">
          <Activity size={14} className="opacity-50 hover:opacity-100" />
        </button>
        <button onClick={onOpenHistory} style={headerBtnStyle} title="Historico">
          <History size={14} className="opacity-50 hover:opacity-100" />
        </button>
        <button onClick={onOpenSettings} style={headerBtnStyle} title="Configuracoes">
          <Settings size={14} className="opacity-50 hover:opacity-100" />
        </button>
        {combatMode && <Zap size={14} className="text-red-500 animate-pulse" />}
        <button onClick={onSignOut} style={{ ...headerBtnStyle, marginLeft: '4px' }} title="Sair">
          <LogOut size={14} className="opacity-50 hover:opacity-100" />
        </button>
      </div>
    </header>
  )
}

const headerBtnStyle = {
  padding: '8px',
  background: 'transparent',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  color: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '36px',
  minHeight: '36px',
}
