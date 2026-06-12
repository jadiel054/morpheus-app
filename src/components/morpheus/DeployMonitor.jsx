import { useState, useEffect } from 'react'

export function DeployMonitor() {
  const [deploys, setDeploys] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const fetch = async () => { try { const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.vercel?.token; if (!t) { setLoading(false); return }; setDeploys([{ id: 'demo', state: 'READY', name: 'morpheus-app', created: Date.now() }]) } catch {} finally { setLoading(false) } }
    fetch(); const i = setInterval(fetch, 60000); return () => clearInterval(i)
  }, [])
  if (loading) return null
  return (
    <div className="deploy-monitor mx-4 mb-2">
      <div className="flex items-center justify-between"><span className="text-xs opacity-60">DEPLOY MONITOR</span><span className="text-xs opacity-40">{deploys.length} deploys</span></div>
      {deploys.map(d => (<div key={d.id} className="flex items-center gap-2 mt-1"><span className={`deploy-status-dot deploy-status-dot--${d.state === 'READY' ? 'success' : d.state === 'ERROR' ? 'failed' : 'building'}`} /><span className="text-xs opacity-70">{d.name}</span><span className="text-xs opacity-40">{d.state}</span></div>))}
    </div>
  )
}
