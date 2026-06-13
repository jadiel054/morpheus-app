const FIXED_CREATOR_FACTS = [
  { label: 'nome', value: 'Jadiel', category: 'personal' },
  { label: 'localizacao', value: 'Xanxere/Santa Catarina, Brasil', category: 'personal' },
  { label: 'profissao', value: 'Desenvolvedor freelancer, estudante SENAC', category: 'professional' },
  { label: 'dispositivo', value: 'mobile-only (Android)', category: 'technical' },
  { label: 'stack_preferida', value: 'React, Vite, Tailwind, Supabase, Vercel, Express/Node, pnpm', category: 'technical' },
]
export { FIXED_CREATOR_FACTS }

export function extractFacts(msg) {
  if (!msg) return []
  const facts = []
  const patterns = [
    { regex: /(?:gosto|gosta|prefiro)\s+(?:de\s+)?(.+?)(?:[.,!]|$)/gi, category: 'preference', prefix: 'gosta de' },
    { regex: /(?:meu\s+nome\s+e|sou\s+o|me\s+chamo)\s+(\w+)/gi, category: 'personal', prefix: 'nome' },
    { regex: /(?:moro|mora)\s+em\s+(.+?)(?:[.,!]|$)/gi, category: 'personal', prefix: 'localizacao' },
  ]
  for (const { regex, category, prefix } of patterns) { const m = regex.exec(msg); if (m) facts.push({ label: prefix + ': ' + m[1].trim(), value: m[1].trim(), category, source: 'extraction' }) }
  return facts
}

export function loadUserMemory(userId) {
  try { const s = localStorage.getItem('morpheus_memory_' + userId); return s ? JSON.parse(s) : { facts: [...FIXED_CREATOR_FACTS], summary: '', id: userId } }
  catch { return { facts: [...FIXED_CREATOR_FACTS], summary: '', id: userId } }
}

export function saveMemoryFacts(userId, newFacts, existing) {
  const all = [...existing.facts, ...newFacts]; const deduped = []; const seen = new Set()
  for (const f of all) { const k = f.label.toLowerCase(); if (!seen.has(k)) { seen.add(k); deduped.push(f) } }
  const mem = { ...existing, facts: deduped.slice(-50), summary: deduped.map(f => f.label).join('; ') }
  try { localStorage.setItem('morpheus_memory_' + userId, JSON.stringify(mem)) } catch {}
  return mem
}

export function buildMemoryPrompt(mem) { return mem?.facts?.length ? mem.facts.map(f => '- ' + f.label).join('\n') : '' }

export function processAndSaveMemory(msg, userId, existing) { const nf = extractFacts(msg); return nf.length ? saveMemoryFacts(userId, nf, existing) : existing }

export async function saveMemoryToSupabase(userId, facts, supabase) {
  if (!userId || !facts?.length) return
  const summary = facts.slice(0, 5).map(f => f.value).join('. ')
  await supabase.from('user_settings').upsert({
    id: userId,
    user_email: '',
    memory_facts: facts,
    memory_summary: summary,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
}
