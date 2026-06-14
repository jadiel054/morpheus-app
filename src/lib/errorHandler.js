// Sistema de error handling para tools do MORPHEUS
// Baseado no Recovery Ladder do Claude Code e classificacao do GraphBit

export const ERROR_TYPES = {
  // Auth/Permissao — critico, precisa de acao do usuario
  AUTH_MISSING:    'AUTH_MISSING',    // sem token configurado
  AUTH_INVALID:    'AUTH_INVALID',    // token invalido/expirado
  AUTH_SCOPE:      'AUTH_SCOPE',      // token sem escopo necessario
  REPO_PRIVATE:    'REPO_PRIVATE',    // repo privado sem permissao

  // Recurso — investigavel e possivelmente recuperavel
  NOT_FOUND:       'NOT_FOUND',       // arquivo/repo nao existe
  REPO_EMPTY:      'REPO_EMPTY',      // repo existe mas esta vazio
  FILE_NOT_FOUND:  'FILE_NOT_FOUND',  // arquivo especifico nao existe

  // Rate limit — retryable
  RATE_LIMIT:      'RATE_LIMIT',      // limite de requests atingido

  // Rede — retryable
  NETWORK_ERROR:   'NETWORK_ERROR',   // falha de conexao
  TIMEOUT:         'TIMEOUT',         // timeout da request

  // Configuracao — requer configuracao
  TOKEN_MISSING:   'TOKEN_MISSING',   // integracao nao configurada
  INVALID_REPO:    'INVALID_REPO',    // nome de repo invalido
}

// Classifica o erro baseado na resposta da API
export function classifyGitHubError(status, headers, body, context) {
  // Rate limit
  if (status === 403 && headers?.['x-ratelimit-remaining'] === '0') {
    const resetTime = headers?.['x-ratelimit-reset']
    return {
      type: ERROR_TYPES.RATE_LIMIT,
      retryable: true,
      retryAfter: resetTime ? new Date(resetTime * 1000) : null,
      userMessage: `Limite de requests do GitHub atingido. Aguarde ${resetTime ? 'ate ' + new Date(resetTime * 1000).toLocaleTimeString() : 'alguns minutos'}.`,
      action: 'WAIT_AND_RETRY',
    }
  }

  // GitHub retorna 404 para repos privados sem permissao (por seguranca)
  // Precisamos distinguir "nao existe" de "sem permissao"
  if (status === 404) {
    const stored = (() => { try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}') } catch { return {} } })()
    const hasToken = stored.github?.token
    if (!hasToken) {
      return {
        type: ERROR_TYPES.TOKEN_MISSING,
        retryable: false,
        userMessage: 'GitHub token nao configurado. Va em Configuracoes > Integracoes > GitHub Token.',
        action: 'CONFIGURE_TOKEN',
      }
    }
    // Tem token — pode ser repo privado sem escopo ou repo inexistente
    return {
      type: ERROR_TYPES.NOT_FOUND,
      retryable: false,
      needsInvestigation: true,
      userMessage: null, // sera determinado apos investigacao
      action: 'INVESTIGATE',
    }
  }

  // Token invalido
  if (status === 401) {
    return {
      type: ERROR_TYPES.AUTH_INVALID,
      retryable: false,
      userMessage: 'GitHub token invalido ou expirado. Configure um novo token em Configuracoes > Integracoes.',
      action: 'RECONFIGURE_TOKEN',
    }
  }

  // Sem permissao explicita
  if (status === 403) {
    return {
      type: ERROR_TYPES.AUTH_SCOPE,
      retryable: false,
      userMessage: 'Sem permissao para esta operacao. O token do GitHub pode precisar de mais escopos.',
      action: 'CHECK_TOKEN_SCOPES',
      requiredScopes: context?.requiredScopes || ['repo'],
    }
  }

  // Erro de servidor — retryable
  if (status >= 500) {
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      retryable: true,
      maxRetries: 2,
      userMessage: 'Servidor do GitHub com instabilidade. Tentando novamente...',
      action: 'RETRY',
    }
  }

  return {
    type: 'UNKNOWN',
    retryable: false,
    userMessage: `Erro desconhecido: ${status}`,
    action: 'REPORT',
  }
}

// Recovery Ladder — tenta estrategias em ordem
export async function withRecovery(operation, context) {
  const MAX_ATTEMPTS = 3
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await operation(attempt)
      return { success: true, data: result, attempts: attempt }
    } catch (err) {
      lastError = err
      const classified = err.classified || { retryable: false }

      // Nao retryable — para imediatamente
      if (!classified.retryable) break

      // Rate limit — espera antes de tentar
      if (classified.type === ERROR_TYPES.RATE_LIMIT && classified.retryAfter) {
        const waitMs = classified.retryAfter - Date.now()
        if (waitMs > 0 && waitMs < 60000) await sleep(waitMs)
        else break // espera muito longa — para
      }

      // Servidor instavel — backoff exponencial
      if (classified.type === ERROR_TYPES.NETWORK_ERROR) {
        await sleep(1000 * attempt) // 1s, 2s, 3s
      }
    }
  }

  return { success: false, error: lastError, attempts: MAX_ATTEMPTS }
}

// Investigacao autonoma quando recebe 404
export async function investigateNotFound(repo, filePath, ghToken, ghUser) {
  const headers = { Authorization: `Bearer ${ghToken}` }
  const findings = []

  // 1. Verificar se o repo existe (mesmo privado, retorna 200 se tem permissao)
  const repoRes = await fetch(
    `https://api.github.com/repos/${ghUser}/${repo}`,
    { headers }
  )

  if (repoRes.status === 404) {
    // Repo nao existe ou e privado sem permissao
    // Verificar escopos do token
    const scopeHeader = repoRes.headers.get('x-oauth-scopes') || ''
    const hasRepoScope = scopeHeader.includes('repo')

    if (!hasRepoScope) {
      return {
        diagnosis: 'TOKEN_MISSING_REPO_SCOPE',
        message: `O repositorio "${repo}" e privado e seu token nao tem o escopo "repo".\n\n**Como resolver:**\n1. Acesse github.com/settings/tokens\n2. Edite seu token\n3. Marque o escopo **"repo"** (Full control of private repositories)\n4. Salve e atualize o token em Configuracoes > Integracoes`,
        fixable: true,
        fixAction: 'UPDATE_TOKEN_SCOPE',
      }
    }

    return {
      diagnosis: 'REPO_NOT_EXISTS',
      message: `O repositorio "${repo}" nao existe ou voce nao tem acesso.\n\n**Repositorios disponiveis:**\nDigite "liste meus repositorios" para ver todos.`,
      fixable: false,
    }
  }

  if (repoRes.ok) {
    const repoData = await repoRes.json()
    findings.push(`Repositorio "${repo}" encontrado (${repoData.private ? 'privado' : 'publico'})`)

    // Repo existe — verificar se o arquivo existe
    if (filePath) {
      const fileRes = await fetch(
        `https://api.github.com/repos/${ghUser}/${repo}/contents/${filePath}`,
        { headers }
      )

      if (fileRes.status === 404) {
        // Listar o que existe no diretorio pai
        const dir = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : ''
        const listRes = await fetch(
          `https://api.github.com/repos/${ghUser}/${repo}/contents/${dir}`,
          { headers }
        )

        if (listRes.ok) {
          const files = await listRes.json()
          const fileList = Array.isArray(files)
            ? files.map(f => `  ${f.type === 'dir' ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n')
            : 'Nao foi possivel listar'

          return {
            diagnosis: 'FILE_NOT_FOUND',
            message: `O arquivo "${filePath}" nao existe no repositorio "${repo}".\n\n**Arquivos disponiveis em /${dir || 'raiz'}:**\n${fileList}\n\nQual arquivo voce gostaria de ler?`,
            fixable: true,
            fixAction: 'SUGGEST_ALTERNATIVES',
            alternatives: Array.isArray(files) ? files.map(f => f.name) : [],
          }
        }
      }

      if (fileRes.ok) {
        findings.push(`Arquivo "${filePath}" encontrado`)
      }
    }
  }

  return {
    diagnosis: 'UNKNOWN',
    message: `Nao foi possivel determinar o problema com "${repo}/${filePath}".`,
    fixable: false,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Verificador de escopos do token (usado pelo SettingsPanel)
export async function testGitHubTokenScopes(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) {
      return { ok: false, message: 'Token invalido' }
    }

    const user = await res.json()
    const scopes = res.headers.get('x-oauth-scopes') || ''
    const scopeList = scopes.split(',').map(s => s.trim()).filter(Boolean)
    const requiredScopes = ['repo']
    const missingScopes = requiredScopes.filter(s => !scopeList.includes(s))

    if (missingScopes.length > 0) {
      return {
        ok: true,
        warning: true,
        message: `Token valido para @${user.login}, mas faltam escopos:\n  ${missingScopes.join(', ')}\n\nEscopos atuais: ${scopeList.join(', ') || 'nenhum'}\n\nPara acessar repos privados, adicione o escopo "repo" em github.com/settings/tokens`,
        user: user.login,
        scopes: scopeList,
        missingScopes,
      }
    }

    return {
      ok: true,
      message: `Token valido — @${user.login}\nEscopos: ${scopeList.join(', ')}`,
      user: user.login,
      scopes: scopeList,
    }
  } catch (e) {
    return { ok: false, message: 'Erro de conexao: ' + e.message }
  }
}
