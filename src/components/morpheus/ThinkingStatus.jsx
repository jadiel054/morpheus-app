function StepIcon({ step }) {
  if (step.status === 'done') return <span style={{ color: '#00FFFF', fontSize: 12 }}>CHECK</span>
  if (step.status === 'failed') return <span style={{ color: '#ff0080', fontSize: 12 }}>X</span>

  // LDRS por tipo de step
  const t = step.text?.toLowerCase() || ''
  if (t.includes('github') || t.includes('reposit'))
    return <div className="ldrs-orbit" style={{ width: 12, height: 12 }} />
  if (t.includes('ia') || t.includes('llm') || t.includes('groq') || t.includes('chamando'))
    return <div className="ldrs-helix" style={{ width: 12, height: 12 }} />
  if (t.includes('salvando') || t.includes('memoria'))
    return <div className="ldrs-bouncy" style={{ height: 12 }}><span/><span/><span/></div>
  if (t.includes('buscando') || t.includes('web') || t.includes('pesquis'))
    return <div className="ldrs-waveform" style={{ height: 12 }}><span/><span/><span/><span/><span/></div>
  if (t.includes('calcul') || t.includes('formatando'))
    return <div className="ldrs-quantum" style={{ width: 12, height: 12 }} />
  if (t.includes('deploy') || t.includes('build'))
    return <div className="ldrs-cardio" style={{ width: 12, height: 12 }} />
  if (t.includes('carregando') || t.includes('conectando'))
    return <div className="ldrs-grid" style={{ width: 12, height: 12 }} />

  // Default
  return <div className="ldrs-dot-pulse"><span/><span/><span/></div>
}

export function ThinkingStatus({ steps, isLoading }) {
  if (!isLoading && steps.length === 0) return null
  return (
    <div className="px-4 py-2">
      {steps.map(step => (
        <div key={step.id} className="flex items-center gap-2 text-xs py-1">
          <div style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <StepIcon step={step} />
          </div>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: step.status === 'done' ? 'rgba(0,255,255,0.4)' : step.status === 'failed' ? 'rgba(255,0,128,0.6)' : 'rgba(0,255,255,0.7)',
            textDecoration: step.status === 'done' ? 'line-through' : 'none',
            transition: 'all 0.3s',
          }}>
            {step.text}
          </span>
          {step.result && (
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(0,255,255,0.3)', marginLeft: 'auto' }}>
              {step.result}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
