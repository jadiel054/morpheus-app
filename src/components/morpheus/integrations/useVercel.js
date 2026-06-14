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

export async function getLatestDeploys(limit = 10) {
  const { token, projectId, teamId } = getVercelConfig()
  if (!token || !projectId) return []
  try {
    const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=${limit}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return []
    const data = await r.json()
    return (data.deployments || []).map(d => ({
      id: d.uid,
      state: d.state,
      name: d.name,
      created: d.created,
      branch: d.meta?.githubCommitRef || 'main',
      commitMessage: d.meta?.githubCommitMessage || '',
      url: d.alias?.[0] ? `https://${d.alias[0]}` : null,
    }))
  } catch { return [] }
}

export async function getDeployLogs(deployId) {
  const { token, teamId } = getVercelConfig()
  if (!token) return ''
  try {
    const r = await fetch(`https://api.vercel.com/v5/deployments/${deployId}/events?teamId=${teamId}&limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) return ''
    return await r.text()
  } catch { return '' }
}

export async function diagnoseFailedDeploy(deployId) {
  const logs = await getDeployLogs(deployId)
  return { deployId, logs: logs.slice(0, 2000), summary: 'Logs capturados.' }
}

export { getVercelConfig }
