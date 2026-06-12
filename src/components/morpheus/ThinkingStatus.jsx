export function ThinkingStatus({ steps, isLoading }) {
  if (!isLoading && steps.length === 0) return null
  return (
    <div className="px-4 py-2">
      {steps.map(step => (
        <div key={step.id} className="flex items-center gap-2 text-xs py-1">
          {step.status === 'running' ? <div className="ldrs-dot-pulse"><span /><span /><span /></div> : step.status === 'done' ? <span className="text-green-400">OK</span> : <span className="text-red-400">FAIL</span>}
          <span className={step.status === 'done' ? 'opacity-50' : 'opacity-80'}>{step.text}</span>
          {step.result && <span className="opacity-40 ml-2">{step.result}</span>}
        </div>
      ))}
    </div>
  )
}
