import type { GithubDiagnosticRecord } from './githubDiagnostics.js'

export const GITHUB_REPOSITORY_CACHE_TTL_MS = 5 * 60 * 1000
export const MAX_GITHUB_RETRIES = 2

type GithubRepoSummary = {
  id?: number
  name: string
  full_name: string
  owner?: { login?: string }
  private?: boolean
  default_branch?: string
  description?: string | null
}

type GithubBranchSummary = {
  name: string
}

type GithubTreeEntry = {
  path: string
  type: 'blob' | 'tree' | string
}

type RequestOptions = {
  token: string
  endpoint: string
  method?: string
  body?: string
  requestedRepository?: string
  resolvedRepository?: string
  owner?: string
  repo?: string
  branch?: string
  path?: string
  diagnostics: GithubDiagnosticRecord[]
}

export type GithubVerifyConnectionResult = {
  authenticated: boolean
  username: string
  repositories: number
  diagnostics: GithubDiagnosticRecord[]
}

export type GithubResolveRepositoryResult = {
  owner: string
  repo: string
  confidence: number
  defaultBranch: string
  requestedRepository: string
  resolvedRepository: string
  ambiguous: boolean
  candidates?: Array<{ owner: string, repo: string, confidence: number }>
  diagnostics: GithubDiagnosticRecord[]
}

export type GithubResolvedContext = {
  requestedRepository: string
  resolvedRepository: string
  owner: string
  repo: string
  repository: GithubRepoSummary
  requestedBranch: string
  branch: string
  defaultBranch: string
  requestedPath: string
  path: string
  diagnostics: GithubDiagnosticRecord[]
}

export type GithubResolverInput = {
  token: string
  requestedRepository?: string
  requestedOwner?: string
  requestedRepo?: string
  requestedBranch?: string
  requestedPath?: string
  requirePath?: boolean
  defaultOwner?: string
  defaultRepository?: string
  userIntent?: string
}

type CacheEntry = {
  expiresAt: number
  repositories: GithubRepoSummary[]
}

const repositoryCache = new Map<string, CacheEntry>()

const GENERIC_REPOSITORY_TERMS = [
  'repo',
  'repository',
  'repositório',
  'repositorio',
  'project',
  'projeto',
  'app',
  'application',
]

export class GithubResolverError extends Error {
  status: number
  code: string
  retryable: boolean
  diagnostics: GithubDiagnosticRecord[]
  details?: unknown
  candidates?: Array<{ owner: string, repo: string, confidence: number }>

  constructor({
    message,
    status,
    code,
    retryable = false,
    diagnostics = [],
    details,
    candidates,
  }: {
    message: string
    status: number
    code: string
    retryable?: boolean
    diagnostics?: GithubDiagnosticRecord[]
    details?: unknown
    candidates?: Array<{ owner: string, repo: string, confidence: number }>
  }) {
    super(message)
    this.name = 'GithubResolverError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.diagnostics = diagnostics
    this.details = details
    this.candidates = candidates
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimSlashes(value = '') {
  return value.replace(/^\/+|\/+$/g, '')
}

function removeGenericTerms(value: string) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token && !GENERIC_REPOSITORY_TERMS.includes(token))
    .join(' ')
    .trim()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
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

function similarity(a: string, b: string) {
  if (!a || !b) return 0
  const maxLength = Math.max(a.length, b.length)
  if (!maxLength) return 1
  return Math.max(0, 1 - levenshtein(a, b) / maxLength)
}

function buildDiagnostic({
  requestedRepository = '',
  resolvedRepository = '',
  owner = '',
  repo = '',
  branch = '',
  path = '',
  endpoint = '',
  status = 0,
  durationMs = 0,
  error = null,
}: Partial<GithubDiagnosticRecord>): GithubDiagnosticRecord {
  return {
    requestedRepository,
    resolvedRepository,
    owner,
    repo,
    branch,
    path,
    url: endpoint ? `https://api.github.com${endpoint}` : '',
    endpoint,
    status,
    durationMs,
    error,
    timestamp: new Date().toISOString(),
  }
}

function parseJson(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function githubApiRequest<T>({
  token,
  endpoint,
  method = 'GET',
  body,
  requestedRepository = '',
  resolvedRepository = '',
  owner = '',
  repo = '',
  branch = '',
  path = '',
  diagnostics,
}: RequestOptions): Promise<T> {
  let attempt = 0
  let lastError: GithubResolverError | null = null

  while (attempt <= MAX_GITHUB_RETRIES) {
    const startedAt = Date.now()
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body } : {}),
    })

    const durationMs = Date.now() - startedAt
    const text = await response.text()
    const data = parseJson(text)

    diagnostics.push(buildDiagnostic({
      requestedRepository,
      resolvedRepository,
      owner,
      repo,
      branch,
      path,
      endpoint,
      status: response.status,
      durationMs,
      error: response.ok ? null : String((data as { message?: string } | null)?.message || `GitHub HTTP ${response.status}`),
    }))

    if (response.ok) return data as T

    const retryable = [429, 500, 502, 503, 504].includes(response.status)
    const error = new GithubResolverError({
      message: formatGithubErrorMessage(response.status, data),
      status: response.status,
      code: `GITHUB_HTTP_${response.status}`,
      retryable,
      diagnostics: [...diagnostics],
      details: data,
    })

    lastError = error

    if (!retryable || attempt >= MAX_GITHUB_RETRIES) {
      throw error
    }

    const retryAfterHeader = response.headers.get('retry-after')
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
    const waitMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 500 * 2 ** attempt
    await sleep(waitMs)
    attempt += 1
  }

  throw lastError || new GithubResolverError({
    message: 'Falha desconhecida ao chamar a API do GitHub.',
    status: 500,
    code: 'GITHUB_UNKNOWN',
    retryable: false,
    diagnostics: [...diagnostics],
  })
}

function formatGithubErrorMessage(status: number, data: unknown) {
  const message = typeof data === 'object' && data && 'message' in data
    ? String((data as { message?: string }).message || '')
    : ''

  if (status === 401) return 'Token GitHub inválido ou expirado. Reconecte a integração.'
  if (status === 403) return 'Acesso negado no GitHub. Verifique as permissões do token.'
  if (status === 404) return message || 'Recurso GitHub não encontrado.'
  if (status === 422) return message || 'Parâmetros inválidos para a API do GitHub.'
  if (status === 429) return 'Limite de requisições do GitHub atingido. Tentando novamente com backoff.'
  if (status >= 500) return 'GitHub indisponível no momento. Tentando novamente.'
  return message || `GitHub HTTP ${status}`
}

function getCacheKey(token: string) {
  return token.slice(-12) || token
}

export function invalidateGithubRepositoryCache(token?: string) {
  if (!token) {
    repositoryCache.clear()
    return
  }
  repositoryCache.delete(getCacheKey(token))
}

export async function listGithubRepositories(token: string, forceRefresh = false) {
  const cacheKey = getCacheKey(token)
  const cached = repositoryCache.get(cacheKey)
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.repositories
  }

  const diagnostics: GithubDiagnosticRecord[] = []
  const repositories: GithubRepoSummary[] = []

  for (let page = 1; page <= 10; page += 1) {
    const pageData = await githubApiRequest<GithubRepoSummary[]>({
      token,
      endpoint: `/user/repos?per_page=100&sort=updated&page=${page}`,
      diagnostics,
    })

    repositories.push(...pageData)
    if (pageData.length < 100) break
  }

  repositoryCache.set(cacheKey, {
    expiresAt: Date.now() + GITHUB_REPOSITORY_CACHE_TTL_MS,
    repositories,
  })

  return repositories
}

function chooseDefaultRepository(
  repositories: GithubRepoSummary[],
  defaultOwner?: string,
  defaultRepository?: string,
) {
  const normalizedDefaultRepo = normalizeText(defaultRepository || '')
  const normalizedDefaultOwner = normalizeText(defaultOwner || '')

  return repositories.find((repository) => {
    const owner = repository.owner?.login || repository.full_name.split('/')[0] || ''
    return normalizedDefaultRepo
      && normalizeText(repository.name) === normalizedDefaultRepo
      && (!normalizedDefaultOwner || normalizeText(owner) === normalizedDefaultOwner)
  }) || null
}

function scoreRepositoryCandidate(query: string, repository: GithubRepoSummary) {
  const normalizedQuery = normalizeText(query)
  const reducedQuery = removeGenericTerms(query) || normalizedQuery
  const owner = repository.owner?.login || repository.full_name.split('/')[0] || ''
  const name = normalizeText(repository.name)
  const fullName = normalizeText(repository.full_name)
  const ownerName = normalizeText(owner)
  const inputs = [name, fullName, `${ownerName} ${name}`]

  if (inputs.includes(normalizedQuery) || inputs.includes(reducedQuery)) return 1
  if (inputs.includes(reducedQuery.replace(/\s+/g, '-'))) return 0.99
  if (fullName === normalizeText(query).replace(/\s+/g, '/')) return 0.99

  let score = 0
  for (const input of inputs) {
    if (input.startsWith(reducedQuery)) score = Math.max(score, 0.94)
    if (input.includes(reducedQuery)) score = Math.max(score, 0.89)
    if (input.replace(/[\s-]+/g, '') === reducedQuery.replace(/[\s-]+/g, '')) score = Math.max(score, 0.97)
    score = Math.max(score, similarity(reducedQuery, input) * 0.86)
  }

  if (reducedQuery && name.startsWith(reducedQuery.split(' ')[0])) {
    score = Math.max(score, 0.85)
  }

  return Math.min(score, 0.995)
}

function extractRepositoryRequest(input: GithubResolverInput) {
  if (input.requestedOwner && input.requestedRepo) {
    return `${input.requestedOwner}/${input.requestedRepo}`
  }

  const explicit = String(input.requestedRepository || '').trim()
  if (explicit) return explicit

  const normalizedIntent = normalizeText(input.userIntent || '')
  const genericIntent = /(meu repositorio|meu reposit[oó]rio|analise o projeto|analise meu projeto|analise meu repositorio|verifique o codigo|verifique o c[oó]digo)/.test(normalizedIntent)
  if (genericIntent && input.defaultRepository) {
    return input.defaultRepository
  }

  return input.defaultRepository || ''
}

export async function verifyGithubConnection(
  token: string,
  defaultOwner?: string,
  defaultRepository?: string,
): Promise<GithubVerifyConnectionResult> {
  const diagnostics: GithubDiagnosticRecord[] = []
  const user = await githubApiRequest<{ login?: string }>({
    token,
    endpoint: '/user',
    diagnostics,
    requestedRepository: defaultRepository || '',
  })
  const repositories = await listGithubRepositories(token)

  return {
    authenticated: true,
    username: String(user.login || defaultOwner || ''),
    repositories: repositories.length,
    diagnostics,
  }
}

export async function resolveGithubRepository(input: GithubResolverInput): Promise<GithubResolveRepositoryResult> {
  const diagnostics: GithubDiagnosticRecord[] = []
  const repositories = await listGithubRepositories(input.token)
  const requestedRepository = extractRepositoryRequest(input)

  if (!repositories.length) {
    throw new GithubResolverError({
      message: 'Nenhum repositório GitHub foi encontrado para a conta autenticada.',
      status: 404,
      code: 'GITHUB_NO_REPOSITORIES',
      diagnostics,
    })
  }

  const exactByOwnerAndRepo = input.requestedOwner && input.requestedRepo
    ? repositories.find((repository) => {
      const owner = repository.owner?.login || repository.full_name.split('/')[0] || ''
      return normalizeText(owner) === normalizeText(input.requestedOwner || '')
        && normalizeText(repository.name) === normalizeText(input.requestedRepo || '')
    })
    : null

  if (exactByOwnerAndRepo) {
    const owner = exactByOwnerAndRepo.owner?.login || exactByOwnerAndRepo.full_name.split('/')[0] || input.defaultOwner || ''
    return {
      owner,
      repo: exactByOwnerAndRepo.name,
      confidence: 1,
      defaultBranch: exactByOwnerAndRepo.default_branch || 'main',
      requestedRepository,
      resolvedRepository: exactByOwnerAndRepo.full_name,
      ambiguous: false,
      diagnostics,
    }
  }

  const defaultRepository = chooseDefaultRepository(repositories, input.defaultOwner, input.defaultRepository)
  if (!requestedRepository && defaultRepository) {
    const owner = defaultRepository.owner?.login || defaultRepository.full_name.split('/')[0] || input.defaultOwner || ''
    return {
      owner,
      repo: defaultRepository.name,
      confidence: 1,
      defaultBranch: defaultRepository.default_branch || 'main',
      requestedRepository: input.defaultRepository || '',
      resolvedRepository: defaultRepository.full_name,
      ambiguous: false,
      diagnostics,
    }
  }

  const ranked = repositories
    .map((repository) => {
      const owner = repository.owner?.login || repository.full_name.split('/')[0] || ''
      return {
        repository,
        owner,
        score: scoreRepositoryCandidate(requestedRepository, repository),
      }
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]

  if (!best || best.score < 0.6) {
    throw new GithubResolverError({
      message: requestedRepository
        ? `Não encontrei um repositório real no GitHub que corresponda a "${requestedRepository}".`
        : 'Não foi possível determinar qual repositório GitHub deve ser usado.',
      status: 404,
      code: 'GITHUB_REPOSITORY_NOT_FOUND',
      diagnostics,
    })
  }

  const ambiguous = Boolean(
    second
    && second.score >= 0.75
    && Math.abs(best.score - second.score) <= 0.05
    && best.repository.full_name !== second.repository.full_name,
  )

  if (ambiguous) {
    throw new GithubResolverError({
      message: `Encontrei mais de um repositório plausível para "${requestedRepository}". Preciso que o usuário escolha um.`,
      status: 409,
      code: 'GITHUB_REPOSITORY_AMBIGUOUS',
      diagnostics,
      candidates: ranked.slice(0, 3).map((item) => ({
        owner: item.owner,
        repo: item.repository.name,
        confidence: Number(item.score.toFixed(3)),
      })),
    })
  }

  return {
    owner: best.owner,
    repo: best.repository.name,
    confidence: Number(best.score.toFixed(3)),
    defaultBranch: best.repository.default_branch || 'main',
    requestedRepository,
    resolvedRepository: best.repository.full_name,
    ambiguous: false,
    diagnostics,
  }
}

async function validateBranch(
  token: string,
  owner: string,
  repo: string,
  requestedRepository: string,
  resolvedRepository: string,
  requestedBranch: string,
  defaultBranch: string,
  diagnostics: GithubDiagnosticRecord[],
) {
  if (!requestedBranch) return defaultBranch

  try {
    const branchData = await githubApiRequest<GithubBranchSummary>({
      token,
      endpoint: `/repos/${owner}/${repo}/branches/${encodeURIComponent(requestedBranch)}`,
      requestedRepository,
      resolvedRepository,
      owner,
      repo,
      branch: requestedBranch,
      diagnostics,
    })
    return branchData.name || defaultBranch
  } catch (error) {
    if (error instanceof GithubResolverError && error.status === 404) {
      return defaultBranch
    }
    throw error
  }
}

async function validatePath(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  requestedRepository: string,
  resolvedRepository: string,
  requestedPath: string,
  requirePath: boolean,
  diagnostics: GithubDiagnosticRecord[],
) {
  const normalizedPath = trimSlashes(requestedPath)
  if (!normalizedPath) return ''

  try {
    await githubApiRequest<unknown>({
      token,
      endpoint: `/repos/${owner}/${repo}/contents/${normalizedPath}?ref=${encodeURIComponent(branch)}`,
      requestedRepository,
      resolvedRepository,
      owner,
      repo,
      branch,
      path: normalizedPath,
      diagnostics,
    })
    return normalizedPath
  } catch (error) {
    if (error instanceof GithubResolverError && error.status === 404 && !requirePath) {
      return normalizedPath
    }

    throw new GithubResolverError({
      message: `O caminho "${normalizedPath}" não existe na branch "${branch}" de ${owner}/${repo}.`,
      status: 404,
      code: 'GITHUB_PATH_NOT_FOUND',
      diagnostics: error instanceof GithubResolverError ? error.diagnostics : diagnostics,
    })
  }
}

export async function resolveGithubContext(input: GithubResolverInput): Promise<GithubResolvedContext> {
  const repositoryResolution = await resolveGithubRepository(input)
  const diagnostics = [...repositoryResolution.diagnostics]

  const repository = await githubApiRequest<GithubRepoSummary>({
    token: input.token,
    endpoint: `/repos/${repositoryResolution.owner}/${repositoryResolution.repo}`,
    requestedRepository: repositoryResolution.requestedRepository,
    resolvedRepository: repositoryResolution.resolvedRepository,
    owner: repositoryResolution.owner,
    repo: repositoryResolution.repo,
    diagnostics,
  })

  const defaultBranch = repository.default_branch || repositoryResolution.defaultBranch || 'main'
  const branch = await validateBranch(
    input.token,
    repositoryResolution.owner,
    repositoryResolution.repo,
    repositoryResolution.requestedRepository,
    repositoryResolution.resolvedRepository,
    String(input.requestedBranch || ''),
    defaultBranch,
    diagnostics,
  )

  const path = await validatePath(
    input.token,
    repositoryResolution.owner,
    repositoryResolution.repo,
    branch,
    repositoryResolution.requestedRepository,
    repositoryResolution.resolvedRepository,
    String(input.requestedPath || ''),
    Boolean(input.requirePath),
    diagnostics,
  )

  return {
    requestedRepository: repositoryResolution.requestedRepository,
    resolvedRepository: repositoryResolution.resolvedRepository,
    owner: repositoryResolution.owner,
    repo: repositoryResolution.repo,
    repository,
    requestedBranch: String(input.requestedBranch || ''),
    branch,
    defaultBranch,
    requestedPath: String(input.requestedPath || ''),
    path,
    diagnostics,
  }
}

export async function getGithubContent(
  context: GithubResolvedContext,
  token: string,
) {
  return githubApiRequest<{
    content?: string
    sha?: string
    size?: number
    type?: string
    name?: string
    path?: string
  } | Array<{
    type?: string
    name?: string
    path?: string
    sha?: string
  }>>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/contents${context.path ? `/${context.path}` : ''}?ref=${encodeURIComponent(context.branch)}`,
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: context.branch,
    path: context.path,
    diagnostics: context.diagnostics,
  })
}

export async function getGithubFileSha(
  context: GithubResolvedContext,
  token: string,
) {
  const data = await githubApiRequest<{ sha?: string }>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/contents/${context.path}?ref=${encodeURIComponent(context.branch)}`,
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: context.branch,
    path: context.path,
    diagnostics: context.diagnostics,
  })
  return data.sha
}

export async function createGithubBranchFromBase(
  token: string,
  context: GithubResolvedContext,
  branchName: string,
  baseBranch: string,
) {
  const branchRef = await githubApiRequest<{ commit?: { sha?: string } }>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/branches/${encodeURIComponent(baseBranch)}`,
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: baseBranch,
    diagnostics: context.diagnostics,
  })

  const sha = branchRef.commit?.sha
  if (!sha) {
    throw new GithubResolverError({
      message: `Não foi possível obter o SHA da branch base "${baseBranch}".`,
      status: 500,
      code: 'GITHUB_BASE_BRANCH_SHA_MISSING',
      diagnostics: context.diagnostics,
    })
  }

  return githubApiRequest<unknown>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/git/refs`,
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: branchName,
    diagnostics: context.diagnostics,
  })
}

export async function putGithubFile(
  token: string,
  context: GithubResolvedContext,
  content: string,
  message: string,
  branch: string,
  sha?: string,
) {
  return githubApiRequest<{
    commit?: { sha?: string, html_url?: string }
    content?: { html_url?: string }
  }>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/contents/${context.path}`,
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch,
    path: context.path,
    diagnostics: context.diagnostics,
  })
}

export async function createGithubPullRequest(
  token: string,
  context: GithubResolvedContext,
  title: string,
  body: string,
  head: string,
  base: string,
) {
  return githubApiRequest<{ html_url?: string, number?: number }>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/pulls`,
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: head,
    diagnostics: context.diagnostics,
  })
}

export async function validateGithubPathFromTree(
  token: string,
  context: GithubResolvedContext,
) {
  if (!context.path) return true
  const tree = await githubApiRequest<{ tree?: GithubTreeEntry[] }>({
    token,
    endpoint: `/repos/${context.owner}/${context.repo}/git/trees/${encodeURIComponent(context.branch)}?recursive=1`,
    requestedRepository: context.requestedRepository,
    resolvedRepository: context.resolvedRepository,
    owner: context.owner,
    repo: context.repo,
    branch: context.branch,
    diagnostics: context.diagnostics,
  })
  return Boolean(tree.tree?.some((entry) => normalizeText(entry.path) === normalizeText(context.path)))
}
