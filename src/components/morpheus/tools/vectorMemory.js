const LK = 'morpheus_vector_memory'; const ML = 200

export function saveMemory({ type, content, metadata = {}, importance = 1 }) {
  try { const s = JSON.parse(localStorage.getItem(LK) || '[]'); s.push({ type, content, metadata, importance, created_at: Date.now() }); localStorage.setItem(LK, JSON.stringify(s.slice(-ML))); return { success: true } }
  catch (err) { return { success: false, error: err.message } }
}

export function searchMemories(query, limit = 5) {
  try { const s = JSON.parse(localStorage.getItem(LK) || '[]'); if (!query) return s.slice(-limit); const q = query.toLowerCase(); return s.filter(m => m.content.toLowerCase().includes(q)).slice(-limit) }
  catch { return [] }
}

export function buildVectorMemoryContext(query) { const m = searchMemories(query, 5); return m.length ? m.map(x => '[' + x.type + '] ' + x.content).join('\n') : '' }

export function autoSaveDecision(userText, reply) {
  if (!userText || !reply) return
  if (/bug|erro|fix|corrigir/.test(userText.toLowerCase())) saveMemory({ type: 'error_solved', content: 'Bug: ' + userText.slice(0, 200) + ' -> ' + reply.slice(0, 200), importance: 3 })
}
