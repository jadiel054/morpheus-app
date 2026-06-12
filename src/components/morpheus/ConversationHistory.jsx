import { useState } from 'react'
import { X } from 'lucide-react'

export function ConversationHistory({ onClose, onLoad }) {
  const [conversations] = useState(() => { try { return JSON.parse(localStorage.getItem('morpheus_conversations') || '[]') } catch { return [] } })
  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-dark-card border-l border-dark-border z-30 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border"><h2 className="text-sm text-cyan font-bold">HISTORICO</h2><button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button></div>
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? <p className="text-xs opacity-40 p-4">Nenhuma conversa salva.</p> : conversations.map((c, i) => <div key={i} className="p-3 border border-dark-border rounded mb-2 cursor-pointer hover:border-cyan/30" onClick={() => onLoad(c)}><p className="text-xs text-cyan truncate">{c.title || 'Sem titulo'}</p><p className="text-xs opacity-40 mt-1">{c.timestamp ? new Date(c.timestamp).toLocaleDateString('pt-BR') : ''}</p></div>)}
      </div>
    </div>
  )
}
