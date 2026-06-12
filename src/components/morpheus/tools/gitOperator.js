import { getGitHubToken } from '../integrations/useGitHub'

let repoCache = null

export function getRepoCache() { return repoCache }
export function invalidateRepoCache() { repoCache = null }

export function resolveRepo() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    return (i.github?.repos || '').split(',').map(r => r.trim()).filter(Boolean)[0] || null
  } catch { return null }
}

// Sandbox test runner — runs before any commit
async function runSandboxTest(repo, filePath, content) {
  try {
    // Check for critical files that could break the build
    const criticalPatterns = [
      /^package\.json$/,
      /^tsconfig\.json$/,
      /^vite\.config/,
      /^\.env$/,
      /^src\/App\./,
      /^src\/main\./,
    ]
    const isCritical = criticalPatterns.some(p => p.test(filePath))
    if (isCritical) {
      // Validate JSON if applicable
      if (filePath.endsWith('.json')) {
        try { JSON.parse(content) } catch {
          return { verdict: 'BLOQUEADO', reason: 'JSON invalido em arquivo critico: ' + filePath }
        }
      }
    }
    return { verdict: 'OK' }
  } catch (err) {
    return { verdict: 'BLOQUEADO', reason: 'Sandbox test failed: ' + err.message }
  }
}

export async function gitOperatorListAllRepos() {
  try {
    const t = getGitHubToken()
    if (!t) return []
    const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' }
    })
    if (!r.ok) return []
    const repos = await r.json()
    repoCache = repos
    return repos
  } catch { return [] }
}

export async function gitOperatorCreateRepo(name, opts = {}) {
  const t = getGitHubToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ name, private: opts.private || false, auto_init: true }),
  })
  if (!r.ok) throw new Error('Falha ao criar repo: ' + r.status)
  invalidateRepoCache()
  return await r.json()
}

export async function gitOperatorProtocoloExtincao(repo, pin) {
  const storedPin = localStorage.getItem('morpheus_emergency_pin') || '123456'
  if (pin !== storedPin) throw new Error('PIN incorreto. Protocolo de extincao requer PIN de 6 digitos.')
  const t = getGitHubToken()
  const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
  const u = i.github?.username || 'jadiel054'
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  })
  if (!r.ok && r.status !== 204) throw new Error('Falha ao deletar: ' + r.status)
  invalidateRepoCache()
  return { success: true, repo, deletedAt: new Date().toISOString() }
}

export async function gitOperatorReadFile(repo, filePath, owner) {
  const t = getGitHubToken()
  const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
  const u = owner || i.github?.username || 'jadiel054'
  if (!t) throw new Error('Token GitHub nao configurado')
  const r = await fetch('https://api.github.com/repos/' + u + '/' + repo + '/contents/' + filePath, {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  })
  if (!r.ok) throw new Error('Arquivo nao encontrado: ' + r.status)
  const d = await r.json()
  return { path: filePath, content: d.content ? atob(d.content) : '', sha: d.sha, size: d.size }
}

export async function gitOperatorListFiles(repo, path, owner) {
  const t = getGitHubToken()
  const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
  const u = owner || i.github?.username || 'jadiel054'
  if (!t) return []
  const url = path
    ? 'https://api.github.com/repos/' + u + '/' + repo + '/contents/' + path
    : 'https://api.github.com/repos/' + u + '/' + repo + '/contents'
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  })
  if (!r.ok) return []
  return await r.json()
}

export async function gitOperatorCommitAndPR(filePath, content, description, repo) {
  const target = repo || resolveRepo()
  if (!target) throw new Error('Nenhum repositorio configurado')

  // REQUIRED: run sandbox test before committing
  const sandboxResult = await runSandboxTest(target, filePath, content)
  if (sandboxResult.verdict === 'BLOQUEADO') {
    throw new Error('SANDBOX_BLOQUEADO: ' + sandboxResult.reason)
  }

  const t = getGitHubToken()
  const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
  const u = i.github?.username || 'jadiel054'
  if (!t) throw new Error('Token GitHub nao configurado')

  const branchName = 'morpheus/feat-' + Date.now().toString(36)
  const message = description || 'feat: update ' + filePath

  // Get base ref
  const refRes = await fetch('https://api.github.com/repos/' + u + '/' + target + '/git/ref/heads/main', {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  })
  if (!refRes.ok) throw new Error('Branch main nao encontrada')
  const refData = await refRes.json()

  // Create branch
  await fetch('https://api.github.com/repos/' + u + '/' + target + '/git/refs', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ ref: 'refs/heads/' + branchName, sha: refData.object.sha }),
  })

  // Commit file
  const commitRes = await fetch('https://api.github.com/repos/' + u + '/' + target + '/contents/' + filePath, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branchName,
    }),
  })
  if (!commitRes.ok) throw new Error('Falha ao commitar: ' + commitRes.status)
  const commitData = await commitRes.json()

  // Create PR
  const prRes = await fetch('https://api.github.com/repos/' + u + '/' + target + '/pulls', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({
      title: message,
      body: description || '',
      head: branchName,
      base: 'main',
    }),
  })
  if (!prRes.ok) throw new Error('Falha ao criar PR: ' + prRes.status)
  const prData = await prRes.json()

  return {
    success: true,
    repo: target,
    branch: branchName,
    commitSha: commitData.commit?.sha?.slice(0, 7) || commitData.sha?.slice(0, 7),
    prUrl: prData.html_url,
    prNumber: prData.number,
    message,
  }
}
