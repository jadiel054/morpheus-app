export const AUTONOMY_POLICY = {
  branchPrefix: 'morpheus/auto',
  destructiveTools: ['github_delete_repo'],
  protectedBranches: ['main', 'master', 'production'],
  maxConsecutiveFailures: 3,
}

export function gerarBranchAutonomo(escopo = 'task') {
  const sufixo = Date.now().toString(36)
  return `${AUTONOMY_POLICY.branchPrefix}-${escopo}-${sufixo}`
}

export function branchProtegida(branch = '') {
  return AUTONOMY_POLICY.protectedBranches.includes(String(branch).toLowerCase())
}

export function exigeAprovacaoHumana(acao = {}) {
  if (AUTONOMY_POLICY.destructiveTools.includes(acao.type)) return true
  if (acao.requiresApproval) return true
  if (acao.metadata?.affectsProduction) return true
  if (acao.metadata?.affectsExternalRepos) return true
  return false
}

export function resumirExecucaoAutonoma({ objetivo, branch, repo, prUrl }) {
  return {
    objetivo: objetivo || 'acao autonoma',
    repo: repo || null,
    branch: branch || null,
    prUrl: prUrl || null,
    timestamp: new Date().toISOString(),
  }
}
