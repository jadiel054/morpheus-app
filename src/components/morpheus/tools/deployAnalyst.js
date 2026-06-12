export async function pollDeployStatus() {
  try { const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}'); const t = i.vercel?.token; const p = i.vercel?.projectId; if (!t || !p) return []; const r = await fetch('https://api.vercel.com/v6/deployments?projectId=' + p + '&limit=5', { headers: { Authorization: 'Bearer ' + t } }); if (!r.ok) return []; const d = await r.json(); return (d.deployments || []).map(x => ({ id: x.uid, state: x.state, name: x.name, created: x.created })) }
  catch { return [] }
}

export async function autoDiagnose(deployId) { return { deployId, summary: 'Diagnostico automatico requer analise LLM.', cause: 'unknown' } }
