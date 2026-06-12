import { ToolCallCard } from './ToolCallCard'

export function ThinkingStream({ thinkingText, activeToolCall, planSteps, isStreaming }) {
  if (!isStreaming && !thinkingText && !activeToolCall && planSteps.length === 0) return null
  return (
    <div className="px-4 py-2 space-y-2">
      {planSteps.length > 0 && <div className="planner-panel"><div className="planner-header"><span>PLANO DE EXECUCAO</span>{isStreaming && <div className="ldrs-dot-pulse"><span /><span /><span /></div>}</div>{planSteps.map(s => <div key={s.id} className={'plan-step plan-step--' + (s.status || 'pending')}>{s.status === 'done' ? <span>OK</span> : s.status === 'running' ? <div className="ldrs-orbit" /> : s.status === 'failed' ? <span>FAIL</span> : <span className="opacity-40">--</span>}<span>{s.title}</span></div>)}</div>}
      {activeToolCall && <ToolCallCard toolCall={activeToolCall} />}
      {thinkingText && <div className="thinking-bubble"><div className="thinking-header"><div className="ldrs-waveform"><span /><span /><span /><span /><span /></div><span>Processando...</span></div><p className="thinking-text">{thinkingText}</p></div>}
    </div>
  )
}
