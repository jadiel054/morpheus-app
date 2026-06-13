export function detectProjectType(fileTree) {
  const f = (fileTree || []).map(x => x.name || x.path || '').join(' ')
  if (/pubspec\.yaml|\.dart/.test(f)) return 'flutter'
  if (/package\.json|tsconfig/.test(f)) return 'node'
  if (/requirements\.txt|setup\.py/.test(f)) return 'python'
  return 'generic'
}

export function staticAnalysis(code, filePath) {
  const errors = []
  const warnings = []

  if (!code || typeof code !== 'string') return { passed: true, errors: [], warnings: [] }

  const ext = (filePath || '').split('.').pop()?.toLowerCase()

  // 1. Chaves balanceadas
  const opens  = (code.match(/\{/g) || []).length
  const closes = (code.match(/\}/g) || []).length
  if (opens !== closes) {
    errors.push({
      type: 'syntax',
      message: `Chaves desbalanceadas: ${opens} { vs ${closes} }`,
      autoFixable: false,
    })
  }

  // 2. Parenteses balanceados
  const openP  = (code.match(/\(/g) || []).length
  const closeP = (code.match(/\)/g) || []).length
  if (openP !== closeP) {
    errors.push({
      type: 'syntax',
      message: `Parenteses desbalanceados: ${openP} ( vs ${closeP} )`,
      autoFixable: false,
    })
  }

  // 3. Imports duplicados (JS/TS)
  if (['js','ts','jsx','tsx'].includes(ext)) {
    const importLines = code.match(/^import .+ from .+/gm) || []
    const sources = importLines.map(l => l.match(/from ['"](.+)['"]/)?.[1]).filter(Boolean)
    const dupes = sources.filter((s, i) => sources.indexOf(s) !== i)
    if (dupes.length > 0) {
      warnings.push({
        type: 'duplicate_import',
        message: `Imports duplicados: ${[...new Set(dupes)].join(', ')}`,
        autoFixable: true,
      })
    }
  }

  // 4. console.log em codigo de producao
  const consoleLogs = (code.match(/console\.log\(/g) || []).length
  if (consoleLogs > 5) {
    warnings.push({
      type: 'debug_code',
      message: `${consoleLogs} console.log detectados — remover antes de producao`,
      autoFixable: true,
    })
  }

  // 5. API keys expostas (seguranca critica)
  const keyPatterns = [
    /sk-[a-zA-Z0-9]{20,}/,
    /gsk_[a-zA-Z0-9]{20,}/,
    /AIzaSy[a-zA-Z0-9]{30,}/,
    /ghp_[a-zA-Z0-9]{30,}/,
  ]
  for (const pattern of keyPatterns) {
    if (pattern.test(code)) {
      errors.push({
        type: 'security',
        message: 'API key exposta no codigo! Nunca commitar tokens.',
        autoFixable: false,
      })
      break
    }
  }

  const passed = errors.length === 0
  const verdict = passed ? 'APROVADO' : 'BLOQUEADO'
  return { passed, errors, warnings, verdict }
}

export function runSandboxTest(code, filePath, projectType = 'generic') {
  const result = staticAnalysis(code, filePath)

  return {
    ...result,
    suggestion: result.passed
      ? 'Codigo aprovado para commit.'
      : `Corrija ${result.errors.length} erro(s) antes de commitar.`
  }
}
