import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { githubDiagnosticsStore } from '../lib/githubDiagnostics.js'
import {
  GithubResolverError,
  createGithubPullRequest,
  getGithubContent,
  getGithubFileSha,
  invalidateGithubRepositoryCache,
  listGithubRepositories,
  putGithubFile,
  resolveGithubContext,
  resolveGithubRepository,
  verifyGithubConnection,
} from '../lib/githubRepositoryResolver.js'

export const githubRouter = Router()

const DEFAULT_GITHUB_OWNER = process.env.GITHUB_OWNER || 'jadiel054'
const DEFAULT_GITHUB_REPOSITORY = process.env.GITHUB_DEFAULT_REPOSITORY || 'morpheus-app'

function getGithubToken(req: Request) {
  return String(req.headers['x-github-token'] || '')
}

function sendResolverError(res: Response, error: unknown) {
  if (error instanceof GithubResolverError) {
    githubDiagnosticsStore.recordMany(error.diagnostics)
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      candidates: error.candidates,
      diagnostics: error.diagnostics,
    })
  }

  return res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
}

githubRouter.get('/verify-connection', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const result = await verifyGithubConnection(token, DEFAULT_GITHUB_OWNER, DEFAULT_GITHUB_REPOSITORY)
    githubDiagnosticsStore.recordMany(result.diagnostics)
    return res.json({
      authenticated: result.authenticated,
      username: result.username,
      repositories: result.repositories,
      diagnostics: result.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.get('/list-repositories', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const repositories = await listGithubRepositories(token, req.query.refresh === 'true')
    return res.json(repositories.map((repository) => ({
      owner: repository.owner?.login || repository.full_name.split('/')[0] || DEFAULT_GITHUB_OWNER,
      repo: repository.name,
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      private: Boolean(repository.private),
      description: repository.description || null,
    })))
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.get('/resolve-repository', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const result = await resolveGithubRepository({
      token,
      requestedRepository: String(req.query.repository || req.query.repo || ''),
      requestedOwner: String(req.query.owner || ''),
      requestedRepo: String(req.query.repoName || ''),
      defaultOwner: DEFAULT_GITHUB_OWNER,
      defaultRepository: DEFAULT_GITHUB_REPOSITORY,
      userIntent: String(req.query.context || ''),
    })
    githubDiagnosticsStore.recordMany(result.diagnostics)
    return res.json({
      owner: result.owner,
      repo: result.repo,
      confidence: result.confidence,
      defaultBranch: result.defaultBranch,
      ambiguous: result.ambiguous,
      diagnostics: result.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.get('/diagnostics/export', authMiddleware, (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename="github_diagnostics.json"')
  return res.status(200).send(JSON.stringify(githubDiagnosticsStore.list(), null, 2))
})

githubRouter.get('/repos', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const repositories = await listGithubRepositories(token, req.query.refresh === 'true')
    return res.json(repositories)
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.get('/repos/:owner/:repo', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const context = await resolveGithubContext({
      token,
      requestedOwner: req.params.owner,
      requestedRepo: req.params.repo,
      defaultOwner: DEFAULT_GITHUB_OWNER,
      defaultRepository: DEFAULT_GITHUB_REPOSITORY,
    })
    githubDiagnosticsStore.recordMany(context.diagnostics)
    return res.json({
      owner: context.owner,
      repo: context.repo,
      full_name: context.resolvedRepository,
      default_branch: context.defaultBranch,
      private: Boolean(context.repository.private),
      description: context.repository.description || null,
      diagnostics: context.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.get('/repos/:owner/:repo/contents/:path(*)', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })

  try {
    const context = await resolveGithubContext({
      token,
      requestedOwner: req.params.owner,
      requestedRepo: req.params.repo,
      requestedBranch: String(req.query.branch || ''),
      requestedPath: req.params.path,
      requirePath: true,
      defaultOwner: DEFAULT_GITHUB_OWNER,
      defaultRepository: DEFAULT_GITHUB_REPOSITORY,
    })
    const data = await getGithubContent(context, token)
    githubDiagnosticsStore.recordMany(context.diagnostics)
    return res.json({
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      path: context.path,
      data,
      diagnostics: context.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.post('/commit', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  const { owner, repo, repository, filePath, content, message, branch } = req.body

  if (!token || !filePath || !content) {
    return res.status(400).json({ error: 'Token, filePath e content sao obrigatorios' })
  }

  try {
    const context = await resolveGithubContext({
      token,
      requestedRepository: repository || repo,
      requestedOwner: owner,
      requestedRepo: repo,
      requestedBranch: branch,
      requestedPath: filePath,
      requirePath: false,
      defaultOwner: DEFAULT_GITHUB_OWNER,
      defaultRepository: DEFAULT_GITHUB_REPOSITORY,
    })

    let sha: string | undefined
    try {
      sha = await getGithubFileSha(context, token)
    } catch (error) {
      if (!(error instanceof GithubResolverError) || error.status !== 404) {
        throw error
      }
    }

    const commit = await putGithubFile(
      token,
      context,
      String(content),
      String(message || 'Update via MORPHEUS'),
      context.branch,
      sha,
    )

    githubDiagnosticsStore.recordMany(context.diagnostics)
    return res.json({
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      baseBranch: context.defaultBranch,
      path: context.path,
      commit,
      diagnostics: context.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.post('/pull-request', authMiddleware, async (req: Request, res: Response) => {
  const token = getGithubToken(req)
  const { owner, repo, repository, title, body, head, base } = req.body

  if (!token || !title || !head) {
    return res.status(400).json({ error: 'Token, title e head sao obrigatorios' })
  }

  try {
    const context = await resolveGithubContext({
      token,
      requestedRepository: repository || repo,
      requestedOwner: owner,
      requestedRepo: repo,
      requestedBranch: base,
      defaultOwner: DEFAULT_GITHUB_OWNER,
      defaultRepository: DEFAULT_GITHUB_REPOSITORY,
    })
    const pr = await createGithubPullRequest(
      token,
      context,
      String(title),
      String(body || ''),
      String(head),
      context.branch,
    )
    githubDiagnosticsStore.recordMany(context.diagnostics)
    return res.json({
      owner: context.owner,
      repo: context.repo,
      head,
      base: context.branch,
      pr,
      diagnostics: context.diagnostics,
    })
  } catch (error) {
    return sendResolverError(res, error)
  }
})

githubRouter.post('/create-repo', authMiddleware, async (req: Request, res: Response) => {
  const { name, description, isPrivate } = req.body
  const token = getGithubToken(req)
  if (!token || !name) return res.status(400).json({ error: 'Token and name required' })

  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({ name, description, private: isPrivate || false, auto_init: true }),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    invalidateGithubRepositoryCache(token)
    return res.json(data)
  } catch (error) {
    return sendResolverError(res, error)
  }
})

export default githubRouter
