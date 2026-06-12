export async function getLatestDeploys(projectId, limit = 10) {
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.vercel?.token; if (!t || !projectId) return []
  const r = await fetch('https://api.vercel.com/v6/deployments?projectId=' + projectId + '&limit=' + limit, { headers: { Authorization: 'Bearer ' + t } })
  return r.ok ? ((await r.json()).deployments || []) : []
}

export async function getDeployLogs(deployId) {
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.vercel?.token; if (!t) return ''
  const r = await fetch('https://api.vercel.com/v2/deployments/' + deployId + '/events', { headers: { Authorization: 'Bearer ' + t } })
  return r.ok ? await r.text() : ''
}

export async function diagnoseFailedDeploy(deployId) { const logs = await getDeployLogs(deployId); return { deployId, logs: logs.slice(0, 2000), summary: 'Logs capturados.' } }
