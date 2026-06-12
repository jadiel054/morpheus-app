export function analyzeSentiment(text) {
  const t = (text || '').toLowerCase()
  if (/urgente|emergencia|socorro|grave/.test(t)) return 'urgent'
  if (/amo|odeio|triste|feliz|incrivel/.test(t)) return 'emotional'
  if (/codigo|erro|bug|debug|api|funcao/.test(t)) return 'technical'
  if (/como|por que|explica|o que e/.test(t)) return 'curious'
  return 'neutral'
}

export function selectArchetype(text, sarcasmLevel = 30, messageCount = 0) {
  const s = analyzeSentiment(text)
  if (s === 'urgent') return 'frank'
  if (s === 'emotional') return 'mentor'
  if (s === 'technical' && sarcasmLevel > 50) return 'sarcastic'
  if (sarcasmLevel > 70 && messageCount > 10) return 'sarcastic'
  return 'default'
}

export function buildPersonalityLayer(archetype, sarcasmLevel, combatMode, sentiment) {
  if (combatMode) return 'MODO COMBAT: Ultra-tecnico, velocidade maxima.'
  switch (archetype) {
    case 'mentor': return 'MODO MENTOR: Didatico, explique o raciocinio.'
    case 'sarcastic': return 'MODO SARCASTICO (nivel ' + sarcasmLevel + '%): Wit tecnico.'
    case 'frank': return 'MODO FRANK: Direto ao ponto.'
    default: return 'MODO DEFAULT: Tecnico + empatico.'
  }
}

export function predictiveContextScan(messages, userName) {
  if (!messages || messages.length < 10) return null
  const r = messages.slice(-10).join(' ').toLowerCase()
  const p = []
  if (/deploy|vercel|build/.test(r)) p.push('deploy_monitor')
  if (/github|commit|pr|repo/.test(r)) p.push('github_ops')
  return p.length ? { predictions: p, confidence: 0.7 } : null
}
