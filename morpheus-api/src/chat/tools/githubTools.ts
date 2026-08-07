// ============================================================================
// MORPHEUS - GitHub Tools
// Funções para operações do GitHub
// ============================================================================

import { podeExecutar, registrarSucesso, registrarFalha } from '../../lib/circuitBreaker'
import {
  verifyGithubConnection,
  listGithubRepositories,
  resolveGithubRepository,
  resolveGithubContext,
  getGithubContent,
  getGithubFileSha,
  putGithubFile,
  createGithubBranchFromBase,
  createGithubPullRequest,
  GithubResolverError,
} from '../../lib/githubRepositoryResolver'
import { githubDiagnosticsStore } from '../../lib/githubDiagnostics'
import { branchProtegida, gerarBranchAutonomo } from '../../lib/autonomyPolicy'
import type { ToolDefinition } from '../types'

// -----------------------------------------------------------------------------
// Tool Definitions
// -----------------------------------------------------------------------------
const GITHUB_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'github_list_repos',
      description: 'Lista repositórios reais do GitHub autenticado. Use para descoberta antes de ler ou editar qualquer repositório.',
      parameters: {
        type: 'object',
        properties: {
          contexto: { type: 'string', description: 'Opcional. Use vazio para listar os repositórios autenticados.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_verify_connection',
      description: 'Verifica autenticação do GitHub e retorna o usuário autenticado e a quantidade de repositórios reais disponíveis.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_repositories',
      description: 'Alias explícito para listar repositórios reais do GitHub autenticado.',
      parameters: {
        type: 'object',
        properties: {
          contexto: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_resolve_repository',
      description: 'Resolve o repositório real no GitHub a partir de nome informal como "Morpheus", "repo morpheus" ou contexto genérico do usuário.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Nome ou apelido informado pelo usuário.' },
          repository: { type: 'string', description: 'Alias para repo.' },
          owner: { type: 'string' },
          contexto: { type: 'string', description: 'Mensagem do usuário para ajudar a resolver o repositório padrão quando necessário.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Lê o conteúdo real de um arquivo do GitHub somente após validar owner, repo, branch e path contra a API real.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
          branch: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_files',
      description: 'Lista arquivos reais de um caminho no repositório após resolver e validar o repositório no GitHub.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          owner: { type: 'string' },
          branch: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_commit_file',
      description: 'Cria ou atualiza um arquivo em um repositório do GitHub somente após validar repositório, branch e path reais. Em autonomia, prefira branch temporária e PR.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          message: { type: 'string' },
          branch: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['path', 'content', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Cria uma nova branch usando como base a default_branch real retornada pela API do GitHub.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          branch: { type: 'string' },
          from: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pr',
      description: 'Abre pull request com mudanças feitas em branch temporária após validar o repositório real.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          repository: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['title', 'head'],
      },
    },
  },
]

// -----------------------------------------------------------------------------
// GitHub Tools Executor
// -----------------------------------------------------------------------------
export class GitHubToolsExecutor {
  private readonly token: string
  private readonly defaultOwner: string
  private readonly defaultRepository: string
  private readonly userIntent: string

  constructor(
    token: string = '',
    defaultOwner: string = process.env.GITHUB_OWNER || 'jadiel054',
    defaultRepository: string = process.env.GITHUB_DEFAULT_REPOSITORY || 'morpheus-app',
    userIntent: string = '',
  ) {
    this.token = token
    this.defaultOwner = defaultOwner
    this.defaultRepository = defaultRepository
    this.userIntent = userIntent
  }

  getToolDefinitions(): ToolDefinition[] {
    return GITHUB_TOOL_DEFINITIONS
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    podeExecutar(name)

    try {
      const result = await this.executeToolFunction(name, args)
      registrarSucesso(name)
      return result
    } catch (error) {
      registrarFalha(name)
      throw error
    }
  }

  private async executeToolFunction(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.token) throw new Error('GITHUB_TOKEN nao configurado')

    switch (name) {
      case 'github_verify_connection':
        return this.executeVerifyConnection()

      case 'github_list_repositories':
      case 'github_list_repos':
        return this.executeListRepositories()

      case 'github_resolve_repository':
        return this.executeResolveRepository(args)

      case 'github_read_file':
        return this.executeReadFile(args)

      case 'github_list_files':
        return this.executeListFiles(args)

      case 'github_commit_file':
        return this.executeCommitFile(args)

      case 'github_create_branch':
        return this.executeCreateBranch(args)

      case 'github_create_pr':
        return this.executeCreatePR(args)

      default:
        throw new Error(`Tool ${name} não implementada`)
    }
  }

  private async executeVerifyConnection(): Promise<string> {
    const verification = await verifyGithubConnection(
      this.token,
      this.defaultOwner,
      this.defaultRepository,
    )
    githubDiagnosticsStore.recordMany(verification.diagnostics)
    return JSON.stringify(verification)
  }

  private async executeListRepositories(): Promise<string> {
    const repositories = await listGithubRepositories(this.token)
    return JSON.stringify(repositories.map((repository: any) => ({
      owner: repository.owner?.login || repository.full_name.split('/')[0] || this.defaultOwner,
      repo: repository.name,
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      private: Boolean(repository.private),
      description: repository.description || null,
    })))
  }

  private async executeResolveRepository(args: Record<string, unknown>): Promise<string> {
    const resolved = await resolveGithubRepository({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedPath: String(args.path || ''),
    })
    githubDiagnosticsStore.recordMany(resolved.diagnostics)
    const result: Record<string, any> = {
      owner: resolved.owner,
      repo: resolved.repo,
      confidence: resolved.confidence,
      defaultBranch: resolved.defaultBranch,
    }
    if ('resolvedRepository' in resolved) {
      result.resolvedRepository = resolved.resolvedRepository
    }
    return JSON.stringify(result)
  }

  private async executeReadFile(args: Record<string, unknown>): Promise<string> {
    const path = String(args.path || '')
    if (!path) throw new Error('path e obrigatorio')

    const context = await resolveGithubContext({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedBranch: String(args.branch || ''),
      requestedPath: path,
      requirePath: true,
    })

    const data = await getGithubContent(context, this.token) as {
      content?: string
      sha?: string
      size?: number
    }
    const content = data.content ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8') : ''
    githubDiagnosticsStore.recordMany(context.diagnostics)

    return JSON.stringify({
      repo: context.repo,
      owner: context.owner,
      path: context.path,
      branch: context.branch,
      content,
      sha: data.sha,
      size: data.size,
      diagnostics: context.diagnostics,
    })
  }

  private async executeListFiles(args: Record<string, unknown>): Promise<string> {
    const context = await resolveGithubContext({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedBranch: String(args.branch || ''),
      requestedPath: String(args.path || ''),
      requirePath: false,
    })

    const data = await getGithubContent(context, this.token)
    githubDiagnosticsStore.recordMany(context.diagnostics)

    return JSON.stringify({
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      path: context.path,
      data,
      diagnostics: context.diagnostics,
    })
  }

  private async executeCommitFile(args: Record<string, unknown>): Promise<string> {
    const path = String(args.path || '')
    const content = String(args.content || '')
    const message = String(args.message || '')
    const branchInformada = String(args.branch || '')

    if (!path || !content || !message) {
      throw new Error('path, content e message sao obrigatorios')
    }

    const context = await resolveGithubContext({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedBranch: branchInformada,
      requestedPath: path,
      requirePath: false,
    })

    const branchBase = context.defaultBranch
    const usarFluxoSeguro = !branchInformada || branchProtegida(branchInformada)
    const branch = usarFluxoSeguro ? gerarBranchAutonomo('patch') : context.branch

    let sha: string | undefined
    try {
      sha = await getGithubFileSha(context, this.token)
    } catch (error) {
      if (!(error instanceof GithubResolverError) || error.status !== 404) {
        throw error
      }
    }

    if (usarFluxoSeguro) {
      await createGithubBranchFromBase(this.token, context, branch, branchBase)
    }

    const data = await putGithubFile(
      this.token,
      context,
      content,
      message,
      branch,
      sha,
    )

    let prUrl: string | undefined
    let prNumber: number | undefined
    if (usarFluxoSeguro) {
      const pr = await createGithubPullRequest(
        this.token,
        context,
        message,
        `Alteração autônoma criada pelo Morpheus para \`${context.path}\`.\n\nFluxo seguro: branch temporária + PR.`,
        branch,
        branchBase,
      )
      prUrl = pr.html_url
      prNumber = pr.number
    }

    return JSON.stringify({
      ...data,
      branch,
      branchBase,
      usarFluxoSeguro,
      prUrl,
      prNumber,
    })
  }

  private async executeCreateBranch(args: Record<string, unknown>): Promise<string> {
    const branch = String(args.branch || '')
    if (!branch) throw new Error('branch e obrigatorio')

    const context = await resolveGithubContext({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedBranch: String(args.from || ''),
      requirePath: false,
    })

    const branchBase = context.defaultBranch
    await createGithubBranchFromBase(this.token, context, branch, branchBase)

    return JSON.stringify({
      owner: context.owner,
      repo: context.repo,
      branch,
      from: branchBase,
    })
  }

  private async executeCreatePR(args: Record<string, unknown>): Promise<string> {
    const title = String(args.title || '')
    const head = String(args.head || '')
    if (!title || !head) throw new Error('title e head sao obrigatorios')

    const context = await resolveGithubContext({
      token: this.token,
      defaultOwner: this.defaultOwner,
      defaultRepository: this.defaultRepository,
      userIntent: this.userIntent,
      requestedRepository: String(args.repository || args.repo || ''),
      requestedOwner: String(args.owner || ''),
      requestedBranch: head,
      requirePath: false,
    })

    const body = String(args.body || '')
    const base = String(args.base || context.defaultBranch)

    const pr = await createGithubPullRequest(
      this.token,
      context,
      title,
      body || `Pull request criado pelo Morpheus para ${title}`,
      head,
      base,
    )

    return JSON.stringify({
      ...pr,
      owner: context.owner,
      repo: context.repo,
    })
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------
export const githubToolsExecutor = new GitHubToolsExecutor()

export { GITHUB_TOOL_DEFINITIONS }
