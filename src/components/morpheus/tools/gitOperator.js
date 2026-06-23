import {
  createBranch,
  createPullRequest,
  getDefaultRepository,
  getToken as getGitHubToken,
  github_resolve_repository,
  listAllRepos,
  listRepoContents,
  readRepoFile,
  commitFile,
} from '../integrations/useGitHub'

let repoCache = null

export function getRepoCache() { return repoCache }
export function invalidateRepoCache() { repoCache = null }

export function resolveRepo() {
  return getDefaultRepository()
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
    const repos = await listAllRepos()
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
  if (!t) throw new Error('Token GitHub nao configurado')
  const resolved = await github_resolve_repository(repo)
  const r = await fetch('https://api.github.com/repos/' + resolved.owner + '/' + resolved.repo, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  })
  if (!r.ok && r.status !== 204) throw new Error('Falha ao deletar: ' + r.status)
  invalidateRepoCache()
  return { success: true, repo, deletedAt: new Date().toISOString() }
}

export async function gitOperatorReadFile(repo, filePath, owner) {
  return await readRepoFile(repo, filePath, owner)
}

export async function gitOperatorListFiles(repo, path, owner) {
  return await listRepoContents(repo, path, owner)
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
  if (!t) throw new Error('Token GitHub nao configurado')
  const resolved = await github_resolve_repository(target)

  const branchName = 'morpheus/feat-' + Date.now().toString(36)
  const message = description || 'feat: update ' + filePath

  await createBranch(resolved.repo, branchName, resolved.default_branch, resolved.owner)
  const commitData = await commitFile(resolved.repo, filePath, content, message, branchName, resolved.owner)
  const prData = await createPullRequest(resolved.repo, message, description || '', branchName, resolved.default_branch, resolved.owner)

  return {
    success: true,
    repo: resolved.repo,
    branch: branchName,
    commitSha: commitData.commit?.sha?.slice(0, 7) || commitData.sha?.slice(0, 7),
    prUrl: prData.html_url,
    prNumber: prData.number,
    message,
  }
}
