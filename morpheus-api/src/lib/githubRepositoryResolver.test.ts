import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  GithubResolverError,
  invalidateGithubRepositoryCache,
  listGithubRepositories,
  resolveGithubContext,
  resolveGithubRepository,
  verifyGithubConnection,
} from './githubRepositoryResolver.js'

type FetchResponseConfig = {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

const originalFetch = global.fetch

function jsonResponse({ status = 200, body = {}, headers = {} }: FetchResponseConfig) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function setFetchMock(handler: (input: string | URL | Request) => Promise<Response>) {
  global.fetch = ((input: string | URL | Request) => handler(input)) as typeof fetch
}

afterEach(() => {
  global.fetch = originalFetch
  invalidateGithubRepositoryCache()
})

test('resolve repositório existente com case-insensitive', async () => {
  setFetchMock(async (input) => {
    const url = String(input)
    if (url.includes('/user/repos')) {
      return jsonResponse({
        body: [
          {
            name: 'morpheus-app',
            full_name: 'jadiel054/morpheus-app',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
        ],
      })
    }

    throw new Error(`URL inesperada no teste: ${url}`)
  })

  const result = await resolveGithubRepository({
    token: 'token-123',
    requestedRepository: 'MORPHEUS',
    defaultOwner: 'jadiel054',
    defaultRepository: 'morpheus-app',
  })

  assert.equal(result.owner, 'jadiel054')
  assert.equal(result.repo, 'morpheus-app')
  assert.equal(result.defaultBranch, 'main')
  assert.equal(result.ambiguous, false)
})

test('retorna erro amigável para repositório inexistente', async () => {
  setFetchMock(async (input) => {
    const url = String(input)
    if (url.includes('/user/repos')) {
      return jsonResponse({
        body: [
          {
            name: 'morpheus-app',
            full_name: 'jadiel054/morpheus-app',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
        ],
      })
    }

    throw new Error(`URL inesperada no teste: ${url}`)
  })

  await assert.rejects(
    () => resolveGithubRepository({
      token: 'token-123',
      requestedRepository: 'repo-que-nao-existe',
      defaultOwner: 'jadiel054',
      defaultRepository: 'morpheus-app',
    }),
    (error: unknown) => {
      assert.ok(error instanceof GithubResolverError)
      assert.equal(error.code, 'GITHUB_REPOSITORY_NOT_FOUND')
      return true
    },
  )
})

test('detecta ambiguidade entre repositórios parecidos', async () => {
  setFetchMock(async (input) => {
    const url = String(input)
    if (url.includes('/user/repos')) {
      return jsonResponse({
        body: [
          {
            name: 'morpheus-app',
            full_name: 'jadiel054/morpheus-app',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
          {
            name: 'morpheus-api',
            full_name: 'jadiel054/morpheus-api',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
        ],
      })
    }

    throw new Error(`URL inesperada no teste: ${url}`)
  })

  await assert.rejects(
    () => resolveGithubRepository({
      token: 'token-123',
      requestedRepository: 'morpheus',
      defaultOwner: 'jadiel054',
      defaultRepository: 'morpheus-app',
    }),
    (error: unknown) => {
      assert.ok(error instanceof GithubResolverError)
      assert.equal(error.code, 'GITHUB_REPOSITORY_AMBIGUOUS')
      assert.ok(Array.isArray(error.candidates))
      assert.ok((error.candidates || []).length >= 2)
      return true
    },
  )
})

test('fallback para default branch quando a branch solicitada não existe', async () => {
  setFetchMock(async (input) => {
    const url = String(input)

    if (url.includes('/user/repos')) {
      return jsonResponse({
        body: [
          {
            name: 'morpheus-app',
            full_name: 'jadiel054/morpheus-app',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
        ],
      })
    }

    if (url.endsWith('/repos/jadiel054/morpheus-app')) {
      return jsonResponse({
        body: {
          name: 'morpheus-app',
          full_name: 'jadiel054/morpheus-app',
          owner: { login: 'jadiel054' },
          default_branch: 'main',
        },
      })
    }

    if (url.includes('/branches/feature-inexistente')) {
      return jsonResponse({
        status: 404,
        body: { message: 'Branch not found' },
      })
    }

    if (url.includes('/contents/README.md?ref=main')) {
      return jsonResponse({
        body: { path: 'README.md', sha: 'abc123', content: 'aGVsbG8=' },
      })
    }

    throw new Error(`URL inesperada no teste: ${url}`)
  })

  const context = await resolveGithubContext({
    token: 'token-123',
    requestedRepository: 'morpheus-app',
    requestedBranch: 'feature-inexistente',
    requestedPath: 'README.md',
    requirePath: true,
    defaultOwner: 'jadiel054',
    defaultRepository: 'morpheus-app',
  })

  assert.equal(context.defaultBranch, 'main')
  assert.equal(context.branch, 'main')
})

test('aplica retry em 429 e usa cache de repositórios', async () => {
  let callCount = 0
  setFetchMock(async (input) => {
    const url = String(input)
    if (url.includes('/user/repos')) {
      callCount += 1
      return jsonResponse({
        body: [
          {
            name: 'morpheus-app',
            full_name: 'jadiel054/morpheus-app',
            owner: { login: 'jadiel054' },
            default_branch: 'main',
          },
        ],
      })
    }

    if (url.endsWith('/user')) {
      callCount += 1
      if (callCount === 1) {
        return jsonResponse({
          status: 429,
          body: { message: 'rate limited' },
          headers: { 'retry-after': '0' },
        })
      }
      return jsonResponse({ body: { login: 'jadiel054' } })
    }

    throw new Error(`URL inesperada no teste: ${url}`)
  })

  const verification = await verifyGithubConnection('token-123', 'jadiel054', 'morpheus-app')
  assert.equal(verification.authenticated, true)
  assert.equal(verification.username, 'jadiel054')
  assert.equal(verification.repositories, 1)

  const first = await listGithubRepositories('token-123')
  const second = await listGithubRepositories('token-123')
  assert.equal(first.length, 1)
  assert.equal(second.length, 1)
  assert.equal(callCount, 3)
})
