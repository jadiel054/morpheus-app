export function getGitHubToken() { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token || null } catch { return null } }
export function getConfiguredRepos() { try { return (JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.repos || '').split(',').map(r => r.trim()).filter(Boolean) } catch { return [] } }

export async function listAllRepos() { const t = getGitHubToken(); if (!t) return []; const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers: { Authorization: 'Bearer ' + t } }); return r.ok ? await r.json() : [] }

export async function readRepoFile(repo, filePath, owner) {
  const t = getGitHubToken(); const u = owner || JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.username || 'jadiel054'; if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/contents/' + filePath, { headers: { Authorization: 'Bearer ' + t } })
  if (!r.ok) throw new Error('Arquivo nao encontrado'); const d = await r.json(); return { path: filePath, content: d.content ? atob(d.content) : '', sha: d.sha }
}

export async function createRepo(name, opts = {}) { const t = getGitHubToken(); if (!t) throw new Error('Token GitHub nao configurado'); const r = await fetch('https://api.github.com/user/repos', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, private: opts.private || false, auto_init: true }) }); if (!r.ok) throw new Error('Falha ao criar repo'); return await r.json() }
