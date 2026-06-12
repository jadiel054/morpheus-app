import { X } from 'lucide-react'

export function ObservabilityPanel({ onClose }) {
  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-40 flex items-center justify-center p-4">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border"><h2 className="text-sm text-cyan font-bold">OBSERVABILIDADE</h2><button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button></div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {['SESSOES AGENTE','MEMORIAS','DEPLOYS','LLM CALLS'].map(l => <div key={l} className="bg-dark-bg border border-dark-border rounded p-3"><p className="text-xs opacity-50">{l}</p><p className="text-lg text-cyan font-bold">0</p></div>)}
          </div>
          <p className="text-xs opacity-40">Logs completos disponiveis no Supabase (agent_sessions).</p>
        </div>
      </div>
    </div>
  )
}
