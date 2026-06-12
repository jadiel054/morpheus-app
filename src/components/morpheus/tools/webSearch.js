const C = new Map(); const TTL = 600000

export async function webSearch(query, limit = 5) {
  const ck = query.toLowerCase().trim(); const cached = C.get(ck); if (cached && Date.now() - cached.ts < TTL) return cached.results
  try { const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}'); const ak = i.brave?.api_key; if (ak) { const r = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + limit, { headers: { 'X-Subscription-Token': ak } }); if (r.ok) { const d = await r.json(); const results = (d.web?.results || []).map(x => ({ title: x.title, url: x.url, snippet: x.description })); C.set(ck, { results, ts: Date.now() }); return results } } }
  catch {}
  try { const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1'); const d = await r.json(); const results = [{ title: d.Heading || query, url: d.AbstractURL || '', snippet: d.Abstract || d.Answer || '' }]; C.set(ck, { results, ts: Date.now() }); return results }
  catch { return [] }
}

export function shouldAutoSearch(text) { return /(?:qual (?:o|a|e) (?:preco|valor|cotacao)|noticias?|o que (?:aconteceu|houve)|quem (?:e|foi)|quando|hoje|agora|atual|recente|clima|temperatura)/i.test(text || '') }

export function formatSearchResults(results) { return results?.length ? results.map((r, i) => (i + 1) + '. ' + r.title + '\n   ' + r.snippet + '\n   ' + r.url).join('\n\n') : '' }
