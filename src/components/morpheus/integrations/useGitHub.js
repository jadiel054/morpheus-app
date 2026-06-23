function getToken() {
  try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github?.token || null }
  catch { return null }
}

function getGitHubConfig() {
  try {
    return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')?.github || {}
  } catch {
    return {}
  }
}

function getOwner() {
  return getGitHubConfig()?.username || null
}

function getDefaultRepository() {
  const github = getGitHubConfig()
  if (github?.defaultRepository) return github.defaultRepository
  const repos = String(github?.repos || '').split(',').map(r => r.trim()).filter(Boolean)
  return repos[0] || null
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

const REPO_CACHE_KEY = '__morpheus_github_repo_cache__'
const REPO_CACHE_TTL_MS = 5 * 60 * 1000

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function reduceRepoQuery(value = '') {
  return normalize(value)
    .split(' ')
    .filter(token => token && !['repo', 'repository', 'repositório', 'repositorio', 'project', 'projeto'].includes(token))
    .join(' ')
    .trim()
}

function levenshtein(a = '', b = '') {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

function similarity(a = '', b = '') {
  const maxLen = Math.max(a.length, b.length)
  if (!maxLen) return 1
  return Math.max(0, 1 - levenshtein(a, b) / maxLen)
}

async function githubFetchJson(url, options = {}, attempt = 0) {
  const r = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } })
  if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 2) {
    const retryAfter = Number(r.headers.get('retry-after') || 0)
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt
    await new Promise(resolve => setTimeout(resolve, waitMs))
    return githubFetchJson(url, options, attempt + 1)
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(data?.message || `GitHub HTTP ${r.status}`)
    err.status = r.status
    err.data = data
    throw err
  }
  return data
}

function readRepoCache() {
  try {
    return JSON.parse(localStorage.getItem(REPO_CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeRepoCache(repos) {
  localStorage.setItem(REPO_CACHE_KEY, JSON.stringify({ ts: Date.now(), repos }))
}

function scoreRepo(query, repo) {
  const reduced = reduceRepoQuery(query) || normalize(query)
  const name = normalize(repo.name)
  const fullName = normalize(repo.full_name)
  const compact = reduced.replace(/[\s-]+/g, '')
  if (!reduced) return 0
  if ([name, fullName].includes(reduced)) return 1
  if ([name, fullName].some(value => value.replace(/[\s-]+/g, '') === compact)) return 0.98
  if ([name, fullName].some(value => value.startsWith(reduced))) return 0.93
  if ([name, fullName].some(value => value.includes(reduced))) return 0.88
  return Math.max(similarity(reduced, name), similarity(reduced, fullName)) * 0.85
}

async function getRepoRegistry(forceRefresh = false) {
  const token = getToken()
  if (!token) return []
  const cached = readRepoCache()
  if (!forceRefresh && cached?.ts && Date.now() - cached.ts < REPO_CACHE_TTL_MS && Array.isArray(cached.repos)) {
    return cached.repos
  }
  const repos = await githubFetchJson('https://api.github.com/user/repos?per_page=100&sort=updated')
  writeRepoCache(repos)
  return repos
}

export async function github_verify_connection() {
  const token = getToken()
  if (!token) return { authenticated: false, username: '', repositories: 0 }
  const user = await githubFetchJson('https://api.github.com/user')
  const repos = await getRepoRegistry()
  return { authenticated: true, username: user.login, repositories: repos.length }
}

export async function github_list_repositories() {
  const repos = await getRepoRegistry()
  return repos.map(repo => ({
    owner: repo.owner?.login || getOwner() || '',
    repo: repo.name,
    full_name: repo.full_name,
    default_branch: repo.default_branch,
    private: Boolean(repo.private),
  }))
}

export async function github_resolve_repository(requestedRepo, owner) {
  const repos = await getRepoRegistry()
  const explicitRepo = requestedRepo || getDefaultRepository()
  if (!explicitRepo) throw new Error('Nenhum repositorio padrao configurado')
  if (owner && explicitRepo) {
    const exact = repos.find(repo => normalize(repo.owner?.login || '') === normalize(owner) && normalize(repo.name) === normalize(explicitRepo))
    if (exact) return { owner: exact.owner?.login || owner, repo: exact.name, default_branch: exact.default_branch, confidence: 1 }
  }
  const ranked = repos
    .map(repo => ({ repo, score: scoreRepo(explicitRepo, repo) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const second = ranked[1]
  if (!best || best.score < 0.6) throw new Error(`Repositorio nao encontrado: ${explicitRepo}`)
  if (second && second.score >= 0.75 && Math.abs(best.score - second.score) <= 0.05) {
    throw new Error(`Repositorio ambiguo: ${best.repo.name}, ${second.repo.name}`)
  }
  return {
    owner: best.repo.owner?.login || getOwner() || '',
    repo: best.repo.name,
    default_branch: best.repo.default_branch || 'main',
    confidence: Number(best.score.toFixed(3)),
  }
}

async function resolveContext(repo, owner, branch, path, { requirePath = false } = {}) {
  const resolved = await github_resolve_repository(repo, owner)
  const repository = await githubFetchJson(`https://api.github.com/repos/${resolved.owner}/${resolved.repo}`)
  let resolvedBranch = repository.default_branch || resolved.default_branch || 'main'
  if (branch) {
    try {
      const branchData = await githubFetchJson(`https://api.github.com/repos/${resolved.owner}/${resolved.repo}/branches/${encodeURIComponent(branch)}`)
      resolvedBranch = branchData.name || resolvedBranch
    } catch {
      resolvedBranch = repository.default_branch || resolved.default_branch || 'main'
    }
  }
  const normalizedPath = String(path || '').replace(/^\/+|\/+$/g, '')
  if (normalizedPath && requirePath) {
    await githubFetchJson(`https://api.github.com/repos/${resolved.owner}/${resolved.repo}/contents/${normalizedPath}?ref=${encodeURIComponent(resolvedBranch)}`)
  }
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    branch: resolvedBranch,
    defaultBranch: repository.default_branch || resolved.default_branch || resolvedBranch,
    path: normalizedPath,
  }
}

// ====== READ ======

export async function listAllRepos() {
  return await getRepoRegistry()
}

export async function listRepoContents(repo, path, owner) {
  const t = getToken()
  if (!t) return []
  const context = await resolveContext(repo, owner, null, path, { requirePath: false })
  const url = context.path
    ? `https://api.github.com/repos/${context.owner}/${context.repo}/contents/${context.path}?ref=${encodeURIComponent(context.branch)}`
    : `https://api.github.com/repos/${context.owner}/${context.repo}/contents?ref=${encodeURIComponent(context.branch)}`
  return await githubFetchJson(url)
}

export async function readRepoFile(repo, filePath, owner) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, null, filePath, { requirePath: true })
  const d = await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/contents/${context.path}?ref=${encodeURIComponent(context.branch)}`)
  return { path: filePath, content: d.content ? atob(d.content) : '', sha: d.sha, size: d.size }
}

export async function getBranchSha(repo, branch, owner) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, branch, null)
  const d = await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/git/ref/heads/${encodeURIComponent(context.branch)}`)
  return { sha: d.object.sha, owner: context.owner, branch: context.branch, defaultBranch: context.defaultBranch }
}

// ====== WRITE ======

export async function createBranch(repo, branchName, fromBranch, owner) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, fromBranch, null)
  const refData = await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/git/ref/heads/${encodeURIComponent(context.branch)}`)
  return await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/' + branchName, sha: refData.object.sha }),
  })
}

export async function commitFile(repo, filePath, content, message, branch, owner) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, branch, filePath)
  const b = context.branch
  let existingSha
  try {
    const existing = await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/contents/${context.path}?ref=${encodeURIComponent(b)}`)
    existingSha = existing.sha
  } catch (err) {
    if (err.status !== 404) throw err
  }
  const body = {
    message: message || conventionalCommit('feat', context.repo, 'update ' + filePath),
    content: btoa(unescape(encodeURIComponent(content))),
    branch: b,
    ...(existingSha ? { sha: existingSha } : {}),
  }
  return await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/contents/${context.path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function createPullRequest(repo, title, body, headBranch, baseBranch, owner) {
  const t = getToken()
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, baseBranch, null)
  return await githubFetchJson(`https://api.github.com/repos/${context.owner}/${context.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: title || 'MORPHEUS: Automated PR',
      body: body || '',
      head: headBranch,
      base: context.branch,
    }),
  })
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
  if (!t) throw new Error('Token GitHub nao configurado')
  const context = await resolveContext(repo, owner, null, null)
  const r = await fetch(`https://api.github.com/repos/${context.owner}/${context.repo}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!r.ok && r.status !== 204) throw new Error('Falha ao deletar: ' + r.status)
  localStorage.removeItem(REPO_CACHE_KEY)
  return { success: true }
}

// ====== PIPELINE ======

export async function gitPushHandler(repo, filePath, content, description) {
  const resolved = await github_resolve_repository(repo || getDefaultRepository(), getOwner())
  const owner = resolved.owner

  const branchName = 'morpheus/feat-' + Date.now().toString(36)
  const msg = conventionalCommit('feat', resolved.repo, description || 'update ' + filePath)

  await createBranch(resolved.repo, branchName, resolved.default_branch, owner)
  const commit = await commitFile(resolved.repo, filePath, content, msg, branchName, owner)
  const pr = await createPullRequest(resolved.repo, msg, description || '', branchName, resolved.default_branch, owner)

  return {
    branchName,
    commitSha: commit.commit?.sha?.slice(0, 7) || commit.sha?.slice(0, 7),
    prUrl: pr.html_url,
    prNumber: pr.number,
  }
}

export { getToken, getOwner, getDefaultRepository, conventionalCommit }
