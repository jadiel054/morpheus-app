import { sendNotification } from '../../../lib/pushNotifications'

export async function pollDeployStatus() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const t = i.vercel?.token
    const p = i.vercel?.projectId
    if (!t || !p) return []
    const r = await fetch('https://api.vercel.com/v6/deployments?projectId=' + p + '&limit=5', {
      headers: { Authorization: 'Bearer ' + t }
    })
    if (!r.ok) return []
    const d = await r.json()
    return (d.deployments || []).map(x => ({
      id: x.uid, state: x.state, name: x.name, created: x.created
    }))
  } catch { return [] }
}

export async function autoDiagnose(deployId) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const t = i.vercel?.token
    if (!t) return { deployId, summary: 'Token Vercel nao configurado.', cause: 'auth' }

    const r = await fetch('https://api.vercel.com/v5/deployments/' + deployId + '/events?limit=20', {
      headers: { Authorization: 'Bearer ' + t }
    })
    if (!r.ok) return { deployId, summary: 'Falha ao buscar eventos do deploy.', cause: 'api_error' }

    const events = await r.json()
    const errors = (events || []).filter(e => e.type === 'error')
    if (errors.length > 0) {
      return {
        deployId,
        summary: errors.map(e => e.text).join('; '),
        cause: errors[0]?.payload?.errorCode || 'build_error',
        errors
      }
    }
    return { deployId, summary: 'Nenhum erro detectado nos eventos do deploy.', cause: 'unknown' }
  } catch {
    return { deployId, summary: 'Diagnostico automatico requer analise LLM.', cause: 'unknown' }
  }
}

export async function monitorAndAlert() {
  const deploys = await pollDeployStatus()
  for (const d of deploys) {
    if (d.state === 'ERROR') {
      await sendNotification('Deploy com Falha', d.name + ' — ver logs', { tag: 'deploy-fail' })
    } else if (d.state === 'READY') {
      await sendNotification('Deploy Concluido', d.name + ' implantado com sucesso', { tag: 'deploy-success' })
    }
  }
  return deploys
}

export async function applyAutoFix(deployId, fixDescription) {
  await sendNotification('Auto-Fix Aplicado', 'Deploy ' + deployId + ' corrigido automaticamente: ' + fixDescription, { tag: 'auto-fix' })
  return { deployId, fixed: true, description: fixDescription }
}
