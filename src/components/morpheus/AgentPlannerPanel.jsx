export function AgentPlannerPanel({ steps, activeToolCall, visible }) {
  if (!visible || steps.length === 0) return null

  const doneCount = steps.filter(s => s.status === 'done').length
  const hasRunning = steps.some(s => s.status === 'running')

  return (
    <div style={{
      margin: '8px 0',
      background: '#0a1520',
      border: '1px solid rgba(0,255,255,0.15)',
      borderRadius: '12px',
      overflow: 'hidden',
      animation: 'fade-in-up 0.3s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(0,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'rgba(0,255,255,0.04)',
      }}>
        {hasRunning
          ? <div className="ldrs-helix" style={{ width: 16, height: 16 }} />
          : <span style={{ fontSize: 14 }}>CHECK</span>
        }
        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(0,255,255,0.7)', letterSpacing: '2px' }}>
          PLANO DE EXECUCAO
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(0,255,255,0.4)' }}>
          {doneCount}/{steps.length}
        </span>
      </div>

      {/* Steps */}
      <div style={{ padding: '8px 0' }}>
        {steps.map((step, i) => (
          <PlanStep key={step.id} step={step} index={i + 1} />
        ))}
      </div>

      {/* Active Tool Call */}
      {activeToolCall && <ActiveToolCallCard toolCall={activeToolCall} />}
    </div>
  )
}

function PlanStep({ step, index }) {
  const icons = {
    pending: <span style={{ color: 'rgba(0,255,255,0.3)', fontSize: 12 }}>O</span>,
    running: <div className="ldrs-orbit" style={{ width: 14, height: 14 }} />,
    done:    <span style={{ color: '#00FFFF', fontSize: 12 }}>CHECK</span>,
    failed:  <span style={{ color: '#ff0080', fontSize: 12 }}>X</span>,
  }
  const colors = {
    pending: 'rgba(0,255,255,0.3)',
    running: '#00FFFF',
    done:    'rgba(0,255,255,0.6)',
    failed:  '#ff0080',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 16px', transition: 'all 0.2s' }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: step.status === 'done' ? 'rgba(0,255,255,0.15)' : 'rgba(0,255,255,0.05)',
        border: `1px solid ${colors[step.status]}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: colors[step.status], fontFamily: 'monospace', flexShrink: 0,
      }}>{index}</span>

      <div style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {icons[step.status]}
      </div>

      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: colors[step.status], transition: 'color 0.3s' }}>
        {step.title}
      </span>

      {step.status === 'running' && (
        <div className="ldrs-waveform" style={{ marginLeft: 'auto' }}>
          <span/><span/><span/><span/><span/>
        </div>
      )}
    </div>
  )
}

function ActiveToolCallCard({ toolCall }) {
  const TOOL_ICONS = {
    github_list_repos: 'BOX',
    github_read_file: 'FILE',
    github_list_files: 'FOLDER',
    github_commit_file: 'PEN',
    github_create_pr: 'FORK',
    vercel_list_deploys: 'ROCKET',
    vercel_diagnose: 'SEARCH',
    supabase_read: 'DB',
    oracle_read: 'BRAIN',
    oracle_write: 'BRAIN',
    web_search: 'GLOBE',
    get_weather: 'SUN',
    calculate: 'CALC',
    telegram_send: 'PHONE',
    memory_search: 'MAGNIFY',
    sandbox_check: 'SHIELD',
  }

  return (
    <div style={{
      margin: '8px 12px',
      background: 'rgba(0,255,255,0.04)',
      border: '1px solid rgba(0,255,255,0.1)',
      borderLeft: '3px solid #00FFFF',
      borderRadius: '8px',
      padding: '10px 12px',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: 16 }}>{TOOL_ICONS[toolCall.name] || 'GEAR'}</span>
        <code style={{ color: '#00FFFF', fontSize: '11px' }}>{toolCall.name}</code>
        {toolCall.status === 'running' && (
          <div className="ldrs-dot-pulse" style={{ marginLeft: 'auto' }}><span/><span/><span/></div>
        )}
        {toolCall.status === 'done' && (
          <span style={{ marginLeft: 'auto', color: '#00FFFF', fontSize: 12 }}>CHECK</span>
        )}
        {toolCall.status === 'failed' && (
          <span style={{ marginLeft: 'auto', color: '#ff0080', fontSize: 12 }}>X</span>
        )}
      </div>

      {toolCall.input && (
        <div style={{ fontSize: '10px', color: 'rgba(0,255,255,0.4)', marginBottom: '4px' }}>
          {Object.entries(toolCall.input).slice(0, 2).map(([k, v]) => (
            <span key={k} style={{ marginRight: 8 }}>
              <span style={{ color: 'rgba(0,255,255,0.6)' }}>{k}:</span> {String(v).slice(0, 30)}
            </span>
          ))}
        </div>
      )}

      {toolCall.result && (
        <div style={{
          fontSize: '11px', color: 'rgba(0,255,255,0.6)',
          background: 'rgba(0,0,0,0.3)', borderRadius: '4px',
          padding: '4px 8px', marginTop: '4px',
          maxHeight: '60px', overflow: 'hidden',
          whiteSpace: 'pre-wrap',
        }}>
          {String(toolCall.result).slice(0, 120)}
          {String(toolCall.result).length > 120 ? '...' : ''}
        </div>
      )}
    </div>
  )
}
