function getToken() {
  try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token || null }
  catch { return null }
}

function getOwner() {
  try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.username || null }
  catch { return null }
}

function headers() {
  return {
    Authorization: 'Bearer ' + getToken(),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
}

function conventionalCommit(type, scope, desc) {
  const s = scope ? '(' + scope + ')' : ''
  return type + s + ': ' + desc
}

// ====== READ ======

export async function listAllRepos() {
  const t = getToken()
  if (!t) return []
  const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers: headers() })
  if (!r.ok) return []
  return await r.json()
}

export async function listRepoContents(repo, path, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t || !u) return []
  const url = path
    ? 'https://api.github.com/repos/' + u + '/' + repo + '/contents/' + path
    : 'https://api.github.com/repos/' + u + '/' + repo + '/contents'
  const r = await fetch(url, { headers: headers() })
  if (!r.ok) return []
  return await r.json()
}

export async function readRepoFile(repo, filePath, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/contents/' + filePath, { headers: headers() })
  if (!r.ok) throw new Error('Arquivo nao encontrado: ' + r.status)
  const d = await r.json()
  return { path: filePath, content: d.content ? atob(d.content) : '', sha: d.sha, size: d.size }
}

export async function getBranchSha(repo, branch, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/git/ref/heads/' + branch, { headers: headers() })
  if (!r.ok) throw new Error('Branch nao encontrada: ' + r.status)
  const d = await r.json()
  return { sha: d.object.sha, owner: u }
}

// ====== WRITE ======

export async function createBranch(repo, branchName, fromBranch, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const base = fromBranch || 'main'
  const ref = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/git/ref/heads/' + base, { headers: headers() })
  if (!ref.ok) throw new Error('Branch base nao encontrada: ' + ref.status)
  const refData = await ref.json()
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/git/refs', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ref: 'refs/heads/' + branchName, sha: refData.object.sha }),
  })
  if (!r.ok) throw new Error('Falha ao criar branch: ' + r.status)
  return await r.json()
}

export async function commitFile(repo, filePath, content, message, branch, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const b = branch || 'main'
  const body = {
    message: message || conventionalCommit('feat', repo, 'update ' + filePath),
    content: btoa(unescape(encodeURIComponent(content))),
    branch: b,
  }
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/contents/' + filePath, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('Falha ao commitar: ' + r.status)
  return await r.json()
}

export async function createPullRequest(repo, title, body, headBranch, baseBranch, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/pulls', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      title: title || 'MORPHEUS: Automated PR',
      body: body || '',
      head: headBranch,
      base: baseBranch || 'main',
    }),
  })
  if (!r.ok) throw new Error('Falha ao criar PR: ' + r.status)
  return await r.json()
}

// ====== REPOS ======

export async function createRepo(name, options) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name,
      description: options?.description || '',
      private: options?.private || false,
      auto_init: true,
    }),
  })
  if (!r.ok) throw new Error('Falha ao criar repo: ' + r.status)
  return await r.json()
}

export async function deleteRepo(repo, owner) {
  const t = getToken()
  const u = owner || getOwner()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!r.ok && r.status !== 204) throw new Error('Falha ao deletar: ' + r.status)
  return { success: true }
}

// ====== PIPELINE ======

export async function gitPushHandler(repo, filePath, content, description) {
  const owner = getOwner()
  if (!owner) throw new Error('Owner nao configurado')

  const branchName = 'morpheus/feat-' + Date.now().toString(36)
  const msg = conventionalCommit('feat', repo, description || 'update ' + filePath)

  await createBranch(repo, branchName, 'main', owner)
  const commit = await commitFile(repo, filePath, content, msg, branchName, owner)
  const pr = await createPullRequest(repo, msg, description || '', branchName, 'main', owner)

  return {
    branchName,
    commitSha: commit.commit?.sha?.slice(0, 7) || commit.sha?.slice(0, 7),
    prUrl: pr.html_url,
    prNumber: pr.number,
  }
}

export { getToken, getOwner, conventionalCommit }
