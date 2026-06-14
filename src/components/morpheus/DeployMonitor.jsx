import { useState, useEffect } from 'react'

function getVercelConfig() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    return {
      token: i.vercel?.token || '',
      projectId: i.vercel?.projectId || '',
      teamId: i.vercel?.teamId || 'team_cxs9DuXfZ1wseY1y7bFj8P1V',
    }
  } catch { return { token: '', projectId: '', teamId: '' } }
}

async function fetchRealDeploys() {
  const { token, projectId, teamId } = getVercelConfig()
  if (!token || !projectId) return []
  try {
    const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=5`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.deployments || []).map(d => ({
      id: d.uid,
      state: d.state,
      name: d.name || 'morpheus-app',
      created: d.created,
      branch: d.meta?.githubCommitRef || 'main',
      commitMessage: d.meta?.githubCommitMessage || '',
      url: d.alias?.[0] ? `https://${d.alias[0]}` : null,
    }))
  } catch { return [] }
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function DeployMonitor() {
  const [deploys, setDeploys] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      const data = await fetchRealDeploys()
      if (!cancelled) {
        setDeploys(data)
        setLoading(false)
      }
    }
    fetch()
    const i = setInterval(fetch, 60000)
    return () => { cancelled = true; clearInterval(i) }
  }, [])

  if (loading) return null
  if (!deploys.length) return null

  const latest = deploys[0]
  const stateColors = { READY: 'success', ERROR: 'failed', BUILDING: 'building', QUEUED: 'building', CANCELED: 'failed' }
  const stateLabels = { READY: 'PRONTO', ERROR: 'FALHA', BUILDING: 'BUILD', QUEUED: 'FILA', CANCELED: 'CANC' }

  return (
    <div className="deploy-monitor mx-4 mb-2" style={{ fontFamily: 'monospace' }}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs opacity-60">DEPLOY MONITOR</span>
        <span className="text-xs opacity-40">{deploys.length} deploys</span>
      </div>

      {/* Latest deploy summary */}
      <div className="flex items-center gap-2 mt-1" style={{ fontSize: '11px' }}>
        <span className={`deploy-status-dot deploy-status-dot--${stateColors[latest.state] || 'building'}`} />
        <span className="opacity-70">{latest.commitMessage?.slice(0, 40) || latest.name}</span>
        <span className="opacity-40">{stateLabels[latest.state] || latest.state}</span>
        <span className="opacity-30 ml-auto">{timeAgo(latest.created)}</span>
      </div>

      {/* Expanded list */}
      {expanded && deploys.slice(1).map(d => (
        <div key={d.id} className="flex items-center gap-2 mt-1" style={{ fontSize: '11px', paddingLeft: '12px' }}>
          <span className={`deploy-status-dot deploy-status-dot--${stateColors[d.state] || 'building'}`} />
          <span className="opacity-60">{d.commitMessage?.slice(0, 30) || d.name}</span>
          <span className="opacity-30">{stateLabels[d.state] || d.state}</span>
          <span className="opacity-20 ml-auto">{timeAgo(d.created)}</span>
        </div>
      ))}
    </div>
  )
}
