export function detectProjectType(fileTree) {
  const f = (fileTree || []).map(x => x.name || x.path || '').join(' ')
  if (/pubspec\.yaml|\.dart/.test(f)) return 'flutter'
  if (/package\.json|tsconfig/.test(f)) return 'node'
  if (/requirements\.txt|setup\.py/.test(f)) return 'python'
  return 'generic'
}

export function staticAnalysis(code, filePath) {
  const errors = []; const warnings = []
  if (!code || typeof code !== 'string') return { passed: true, errors: [], warnings: [] }
  let braces = 0
  for (const ch of code) { if (ch === '{') braces++; if (ch === '}') braces--; if (braces < 0) { errors.push('Chave extra'); break } }
  if (braces !== 0) errors.push('Chaves desbalanceadas: ' + braces)
  const imports = code.match(/import\s+.*?from\s+['"][^'"]+['"]/g) || []; const seen = new Set()
  for (const imp of imports) { if (seen.has(imp)) warnings.push('Import duplicado: ' + imp); seen.add(imp) }
  return { passed: errors.length === 0, errors, warnings }
}

export function runSandboxTest(code, filePath, projectType = 'generic') {
  const a = staticAnalysis(code, filePath)
  return a.passed ? { passed: true, errors: [], verdict: 'APROVADO', suggestion: 'OK para commit.' } : { passed: false, errors: a.errors, verdict: 'BLOQUEADO', suggestion: 'Corrija os erros.' }
}
