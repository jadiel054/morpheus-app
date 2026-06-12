export const ALL_ACCEPT_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.docx,.xlsx,.xls,.csv,.html,.htm,.js,.ts,.jsx,.tsx,.py,.rs,.go,.java,.c,.cpp,.css,.json,.yaml,.yml,.md,.txt,.sh,.sql'

export async function processFile(file) {
  const id = 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (file.type.startsWith('image/')) { const data = await fileToBase64(file); const preview = URL.createObjectURL(file); return { id, name: file.name, type: 'image', size: file.size, data, preview, mimeType: file.type } }
  if (ext === 'pdf' || file.type === 'application/pdf') { const data = await fileToBase64(file); return { id, name: file.name, type: 'pdf', size: file.size, data, mimeType: 'application/pdf' } }
  if (ext === 'docx') { const text = await extractDocxText(file); return { id, name: file.name, type: 'word', size: file.size, text } }
  if (ext === 'xlsx' || ext === 'xls') { const text = await extractXlsxText(file); return { id, name: file.name, type: 'excel', size: file.size, text } }
  if (ext === 'csv' || file.type === 'text/csv') { const text = await file.text(); return { id, name: file.name, type: 'csv', size: file.size, text: text.slice(0, 20000) } }
  if (ext === 'html' || ext === 'htm') { const raw = await file.text(); return { id, name: file.name, type: 'html', size: file.size, text: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } }
  const codeExts = ['js','ts','jsx','tsx','py','rs','go','java','c','cpp','css','json','yaml','yml','md','txt','sh','sql']
  if (codeExts.includes(ext)) { const text = await file.text(); return { id, name: file.name, type: ext === 'txt' || ext === 'md' ? 'text' : 'code', size: file.size, text: text.slice(0, 50000) } }
  try { const text = await file.text(); return { id, name: file.name, type: 'text', size: file.size, text: text.slice(0, 20000) } }
  catch { const data = await fileToBase64(file); return { id, name: file.name, type: 'text', size: file.size, data } }
}

export async function processLink(url) {
  try { const res = await fetch('https://r.jina.ai/' + url); const text = await res.text(); return { id: 'att_link_' + Date.now(), name: url, type: 'link', url, text: text.slice(0, 20000) } }
  catch { return { id: 'att_link_' + Date.now(), name: url, type: 'link', url, text: '[Link: ' + url + ']' } }
}

function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) }) }

async function extractDocxText(file) { try { const { default: mammoth } = await import('mammoth'); const buf = await file.arrayBuffer(); const r = await mammoth.extractRawText({ arrayBuffer: buf }); return r.value.slice(0, 30000) } catch { return '[Documento Word: ' + file.name + ']' } }

async function extractXlsxText(file) { try { const XLSX = await import('xlsx'); const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' }); const lines = []; for (const sn of wb.SheetNames) lines.push('=== ' + sn + ' ===\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn])); return lines.join('\n\n').slice(0, 30000) } catch { return '[Planilha Excel: ' + file.name + ']' } }

export function buildContentWithAttachments(text, attachments) {
  if (!attachments?.length) return text
  const parts = []; let hasImages = false
  for (const att of attachments) {
    if (att.type === 'image' && att.data) { hasImages = true; parts.push({ type: 'image_url', image_url: { url: 'data:' + att.mimeType + ';base64,' + att.data } }) }
    else if (att.text) { const label = { word: 'Documento Word', excel: 'Planilha Excel', csv: 'CSV', html: 'HTML', code: 'Codigo', text: 'Texto', link: 'Link', pdf: 'PDF' }[att.type] || 'Arquivo'; parts.push({ type: 'text', text: '\n' + label + ': ' + att.name + '\n```\n' + att.text + '\n```\n' }) }
  }
  parts.push({ type: 'text', text })
  return hasImages ? parts : text + '\n\n' + parts.filter(p => p.type === 'text').map(p => p.text).join('')
}
