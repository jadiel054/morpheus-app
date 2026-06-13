import { runSandboxTest } from './sandboxRunner'

export async function gitOperatorCommitAndPR(filePath, content, description, repo) {
  // SANDBOX OBRIGATORIO antes de qualquer commit
  const sandboxResult = runSandboxTest(content, filePath)

  if (!sandboxResult.passed) {
    return {
      success: false,
      blocked: true,
      verdict: 'BLOQUEADO',
      errors: sandboxResult.errors,
      message: `Commit bloqueado pelo sandbox:\n${sandboxResult.errors.map(e => `- ${e.message}`).join('\n')}`,
    }
  }

  // Warnings nao bloqueiam mas sao logados
  if (sandboxResult.warnings.length > 0) {
    console.warn('[Sandbox] Avisos:', sandboxResult.warnings)
  }

  // Prossegue com o commit via GitHub API
  const { owner, repo: repoName } = repo || {}
  if (!owner || !repoName) {
    return {
      success: false,
      message: 'Repositorio nao configurado. Informe owner/repo.',
    }
  }

  const GITHUB_TOKEN = (() => {
    try { return JSON.parse(localStorage.getItem('morpheus_integrations') || '{}').github_key || '' }
    catch { return '' }
  })()

  if (!GITHUB_TOKEN) {
    return {
      success: false,
      message: 'GitHub token nao configurado. Va em Configuracoes > Integracoes.',
    }
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: description || 'Commit via MORPHEUS',
        content: btoa(unescape(encodeURIComponent(content))),
      }),
    })

    if (res.ok) {
      return {
        success: true,
        verdict: 'APROVADO',
        message: `Arquivo ${filePath} commitado com sucesso.`,
      }
    }

    const err = await res.json()
    return {
      success: false,
      message: `Erro GitHub: ${err.message || 'Falha ao commitar'}`,
    }
  } catch (err) {
    return {
      success: false,
      message: `Erro: ${err.message}`,
    }
  }
}
