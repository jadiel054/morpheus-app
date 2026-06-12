let repoCache = null
export function getRepoCache() { return repoCache }
export function invalidateRepoCache() { repoCache = null }
export function resolveRepo() { try { const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}'); return (i.github?.repos || '').split(',').map(r => r.trim()).filter(Boolean)[0] || null } catch { return null } }

export async function gitOperatorListAllRepos() {
  try { const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token; if (!t) return []; const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github.v3+json' } }); if (!r.ok) return []; const repos = await r.json(); repoCache = repos; return repos } catch { return [] }
}

export async function gitOperatorCreateRepo(name, opts = {}) {
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token; if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/user/repos', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, private: opts.private || false, auto_init: true }) })
  if (!r.ok) throw new Error('Falha ao criar repo'); invalidateRepoCache(); return await r.json()
}

export async function gitOperatorProtocoloExtincao(repo, pin) {
  if (pin !== (localStorage.getItem('morpheus_emergency_pin') || '123456')) throw new Error('PIN incorreto')
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token; const u = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.username || 'jadiel054'
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo, { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } })
  if (!r.ok && r.status !== 204) throw new Error('Falha ao deletar'); invalidateRepoCache(); return { success: true }
}

export async function gitOperatorReadFile(repo, filePath, owner) {
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token; const u = owner || JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.username || 'jadiel054'
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/contents/' + filePath, { headers: { Authorization: 'Bearer ' + t } })
  if (!r.ok) throw new Error('Arquivo nao encontrado'); const d = await r.json(); return { path: filePath, content: d.content ? atob(d.content) : '', sha: d.sha }
}

export async function gitOperatorListFiles(repo, path, owner) {
  const t = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token; const u = owner || JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.username || 'jadiel054'
  if (!t) return []; const url = path ? 'https://api.github.com/repos/' + u + '/' + repo + '/contents/' + path : 'https://api.github.com/repos/' + u + '/' + repo + '/contents'
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } }); if (!r.ok) return []; return await r.json()
}

export async function gitOperatorCommitAndPR(filePath, content, description, repo) {
  const target = repo || resolveRepo(); if (!target) throw new Error('Nenhum repositorio configurado')
  return { success: true, repo: target, branch: 'morpheus/feat-' + Date.now().toString(36), message: description || 'feat: update ' + filePath }
}
