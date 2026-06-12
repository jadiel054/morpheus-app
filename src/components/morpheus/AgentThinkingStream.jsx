import { useEffect, useRef, useState } from 'react'
import { Brain, CheckCircle2, Circle, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

const DEFAULT_STEPS = [
  { id: 'analyze', label: 'Analisando prompt', status: 'pending' },
  { id: 'plan', label: 'Planejando acoes', status: 'pending' },
  { id: 'search', label: 'Buscando contexto', status: 'pending' },
  { id: 'execute', label: 'Executando ferramentas', status: 'pending' },
  { id: 'synthesize', label: 'Sintetizando resposta', status: 'pending' },
]

export function AgentThinkingStream({ isActive, steps = [], onStepChange }) {
  const [internalSteps, setInternalSteps] = useState(DEFAULT_STEPS)
  const [expanded, setExpanded] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isActive) return
    setInternalSteps(DEFAULT_STEPS.map(s => ({ ...s, status: 'pending' })))
    let idx = 0
    const timer = setInterval(() => {
      setInternalSteps(prev => {
        const next = [...prev]
        if (idx < next.length) {
          next[idx] = { ...next[idx], status: 'running' }
          if (idx > 0) next[idx - 1] = { ...next[idx - 1], status: 'done' }
          idx++
        } else {
          clearInterval(timer)
        }
        return next
      })
    }, 800)
    return () => clearInterval(timer)
  }, [isActive])

  useEffect(() => {
    if (steps?.length) {
      setInternalSteps(steps)
    }
  }, [steps])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [internalSteps])

  if (!isActive && internalSteps.every(s => s.status === 'pending')) return null

  const statusIcon = (status) => {
    switch (status) {
      case 'done': return <CheckCircle2 size={14} className="text-green-400" />
      case 'running': return <Loader2 size={14} className="text-cyan animate-spin" />
      case 'failed': return <AlertTriangle size={14} className="text-red-400" />
      default: return <Circle size={14} className="opacity-30" />
    }
  }

  return (
    <div className="agent-thinking-stream" ref={containerRef}>
      <style>{`
        .agent-thinking-stream { border: 1px solid rgba(123,97,255,0.15); border-radius: 8px; margin: 8px 0; background: rgba(123,97,255,0.03); overflow: hidden; transition: all 0.3s; }
        .thinking-stream-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none; }
        .thinking-stream-header:hover { background: rgba(123,97,255,0.05); }
        .thinking-stream-title { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: #7B61FF; }
        .thinking-stream-body { padding: 0 12px 12px; }
        .thinking-step { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 0.7rem; transition: all 0.3s; }
        .thinking-step--done { opacity: 0.5; }
        .thinking-step--running { color: var(--cyan); }
        .thinking-step--failed { color: #ff4444; }
        .thinking-step-label { flex: 1; }
        .thinking-step-detail { font-size: 0.6rem; opacity: 0.5; margin-left: 24px; }
        .thinking-progress-bar { height: 2px; background: rgba(123,97,255,0.1); margin: 4px 0; border-radius: 1px; overflow: hidden; }
        .thinking-progress-fill { height: 100%; background: linear-gradient(90deg, #7B61FF, var(--cyan)); transition: width 0.5s ease; border-radius: 1px; }
      `}</style>

      <div className="thinking-stream-header" onClick={() => setExpanded(!expanded)}>
        <div className="thinking-stream-title">
          <Brain size={14} />
          <span>Agent Thinking Stream</span>
        </div>
        <div style={{ flex: 1 }} />
        {expanded ? <ChevronDown size={12} opacity={0.4} /> : <ChevronRight size={12} opacity={0.4} />}
      </div>

      {expanded && (
        <div className="thinking-stream-body">
          <div className="thinking-progress-bar">
            <div
              className="thinking-progress-fill"
              style={{ width: `${(internalSteps.filter(s => s.status === 'done').length / internalSteps.length) * 100}%` }}
            />
          </div>
          {internalSteps.map(step => (
            <div key={step.id}>
              <div className={`thinking-step thinking-step--${step.status}`}>
                {statusIcon(step.status)}
                <span className="thinking-step-label">{step.label}</span>
                {step.tool && <span className="thinking-step-detail">{step.tool}</span>}
              </div>
              {step.detail && step.status === 'running' && (
                <div className="thinking-step-detail">{step.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
