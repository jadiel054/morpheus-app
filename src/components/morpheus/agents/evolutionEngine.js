export function loadEvolutionProfile(userId) {
  try { const s = localStorage.getItem('morpheus_evolution_' + userId); return s ? JSON.parse(s) : def() } catch { return def() }
  function def() { return { styleProfile: { tone: 'balanced', responseLength: 'medium', avoidPatterns: [], reinforcePatterns: [], likeCount: 0, dislikeCount: 0 }, feedbackLog: [], messageCount: 0 } }
}

export function recordLike(id, msg, prompt, p) { p.styleProfile.likeCount++; p.feedbackLog.push({ type: 'like', id, ts: Date.now() }); save(id, p); return p }
export function recordDislike(id, msg, prompt, p) { p.styleProfile.dislikeCount++; p.feedbackLog.push({ type: 'dislike', id, ts: Date.now() }); save(id, p); return p }
export function incrementMessageCount(id, p) { p.messageCount++; if (p.messageCount % 50 === 0) save(id, p); return { updated: p, shouldSync: p.messageCount % 50 === 0 } }

export function analyzeIntent(msg) {
  const t = (msg || '').toLowerCase()
  if (/urgente|rapido|emergencia/.test(t)) return { wantsDetail: false, wantsQuick: true, emotion: 'urgent', urgency: 'high' }
  if (/explica|detalhe|como|por que/.test(t)) return { wantsDetail: true, wantsQuick: false, emotion: 'curious', urgency: 'low' }
  return { wantsDetail: false, wantsQuick: false, emotion: 'neutral', urgency: 'normal' }
}

export function buildStyleLayer(p, intent) {
  let ins = ''
  if (p.styleProfile.tone === 'terse') ins += 'Seja conciso. '
  if (intent?.wantsQuick) ins += 'Resposta rapida. '
  if (intent?.wantsDetail) ins += 'Explique com profundidade. '
  return ins.trim()
}

export function generateSyncReport(id, p) { return '[SYNC] ' + p.messageCount + ' msgs | ' + p.styleProfile.likeCount + ' likes' }
function save(id, p) { try { localStorage.setItem('morpheus_evolution_' + id, JSON.stringify(p)) } catch {} }
