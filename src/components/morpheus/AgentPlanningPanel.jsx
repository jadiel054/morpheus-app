import { Play, Square } from 'lucide-react'

export function AgentPlanningPanel({ tasks = [], isExecuting, onExecute, onCancel }) {
  if (tasks.length === 0) return null
  return (
    <div className="agent-planning-panel">
      <div className="flex items-center justify-between mb-3"><span className="text-sm text-cyan font-bold">PLANO DE EXECUCAO</span>
        <div className="flex gap-2">{!isExecuting ? <button onClick={onExecute} className="flex items-center gap-1 px-3 py-1 bg-cyan/10 border border-cyan rounded text-xs text-cyan hover:bg-cyan/20"><Play size={10} /> EXECUTAR</button> : <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1 bg-red-500/10 border border-red-500 rounded text-xs text-red-400"><Square size={10} /> CANCELAR</button>}</div>
      </div>
      {tasks.map((t, i) => <div key={i} className={`plan-step plan-step--${t.status || 'pending'}`}>{t.status === 'done' ? <span>OK</span> : t.status === 'running' ? <div className="ldrs-orbit" /> : t.status === 'failed' ? <span>FAIL</span> : <span className="opacity-40">--</span>}<span>{t.title}</span></div>)}
    </div>
  )
}
