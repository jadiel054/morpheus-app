import { useState, useEffect } from 'react'
import { Settings, History, Activity, Zap, LogOut } from 'lucide-react'

export function ProtocolHeader({ protocolId = 'NEBUCHADNEZZAR v1.0', onOpenSettings, onOpenHistory, onOpenObservability, combatMode, onSignOut }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-dark-border bg-dark-bg/90 backdrop-blur">
      <div className="flex items-center gap-3"><span className="protocol-badge">{protocolId} // SYSTEM ONLINE</span></div>
      <div className="flex items-center gap-2 text-xs opacity-60"><span>{time.toLocaleTimeString('pt-BR')}</span></div>
      <div className="flex items-center gap-1">
        <button onClick={onOpenObservability} className="p-2 hover:bg-dark-card rounded"><Activity size={14} className="opacity-50 hover:opacity-100" /></button>
        <button onClick={onOpenHistory} className="p-2 hover:bg-dark-card rounded"><History size={14} className="opacity-50 hover:opacity-100" /></button>
        <button onClick={onOpenSettings} className="p-2 hover:bg-dark-card rounded"><Settings size={14} className="opacity-50 hover:opacity-100" /></button>
        {combatMode && <Zap size={14} className="text-red-500 animate-pulse" />}
        <button onClick={onSignOut} className="p-2 hover:bg-dark-card rounded ml-2"><LogOut size={14} className="opacity-50 hover:opacity-100" /></button>
      </div>
    </header>
  )
}
