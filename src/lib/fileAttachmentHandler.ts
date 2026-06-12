export interface Attachment {
  id: string
  name: string
  type: 'image' | 'pdf' | 'word' | 'excel' | 'csv' | 'html' | 'code' | 'text' | 'link'
  size: number
  data?: string
  preview?: string
  text?: string
  url?: string
  mimeType?: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function extractDocxText(file: File): Promise<string> {
  try {
    const { default: mammoth } = await import('mammoth')
    const buf = await file.arrayBuffer()
    const r = await mammoth.extractRawText({ arrayBuffer: buf })
    return r.value.slice(0, 30000)
  } catch {
    return '[Documento Word: ' + file.name + ']'
  }
}

async function extractXlsxText(file: File): Promise<string> {
  try {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const lines: string[] = []
    for (const sn of wb.SheetNames) {
      lines.push('=== ' + sn + ' ===\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn]))
    }
    return lines.join('\n\n').slice(0, 30000)
  } catch {
    return '[Planilha Excel: ' + file.name + ']'
  }
}

export async function processFile(file: File): Promise<Attachment> {
  const id = 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  if (file.type.startsWith('image/')) {
    const data = await fileToBase64(file)
    const preview = URL.createObjectURL(file)
    return { id, name: file.name, type: 'image', size: file.size, data, preview, mimeType: file.type }
  }

  if (ext === 'pdf' || file.type === 'application/pdf') {
    const data = await fileToBase64(file)
    return { id, name: file.name, type: 'pdf', size: file.size, data, mimeType: 'application/pdf' }
  }

  if (ext === 'docx') {
    const text = await extractDocxText(file)
    return { id, name: file.name, type: 'word', size: file.size, text }
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const text = await extractXlsxText(file)
    return { id, name: file.name, type: 'excel', size: file.size, text }
  }

  if (ext === 'csv' || file.type === 'text/csv') {
    const text = await file.text()
    return { id, name: file.name, type: 'csv', size: file.size, text: text.slice(0, 20000) }
  }

  if (ext === 'html' || ext === 'htm') {
    const raw = await file.text()
    return { id, name: file.name, type: 'html', size: file.size, text: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
  }

  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'css', 'json', 'yaml', 'yml', 'md', 'txt', 'sh', 'sql', 'toml', 'xml', 'graphql', 'prisma', 'env']
  if (codeExts.includes(ext)) {
    const text = await file.text()
    return { id, name: file.name, type: ext === 'txt' || ext === 'md' ? 'text' : 'code', size: file.size, text: text.slice(0, 50000) }
  }

  try {
    const text = await file.text()
    return { id, name: file.name, type: 'text', size: file.size, text: text.slice(0, 20000) }
  } catch {
    const data = await fileToBase64(file)
    return { id, name: file.name, type: 'text', size: file.size, data }
  }
}

export async function processLink(url: string): Promise<Attachment> {
  try {
    const res = await fetch('https://r.jina.ai/' + url)
    const text = await res.text()
    return { id: 'att_link_' + Date.now(), name: url, type: 'link', url, text: text.slice(0, 20000), size: text.length }
  } catch {
    return { id: 'att_link_' + Date.now(), name: url, type: 'link', url, text: '[Link: ' + url + ']', size: 0 }
  }
}

export function buildContentWithAttachments(text: string, attachments: Attachment[]): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (!attachments?.length) return text

  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
  let hasImages = false

  for (const att of attachments) {
    if (att.type === 'image' && att.data) {
      hasImages = true
      parts.push({ type: 'image_url', image_url: { url: 'data:' + (att.mimeType || 'image/png') + ';base64,' + att.data } })
    } else if (att.text) {
      const labelMap: Record<string, string> = { word: 'Documento Word', excel: 'Planilha Excel', csv: 'CSV', html: 'HTML', code: 'Codigo', text: 'Texto', link: 'Link', pdf: 'PDF' }
      const label = labelMap[att.type] || 'Arquivo'
      parts.push({ type: 'text', text: '\n' + label + ': ' + att.name + '\n```\n' + att.text + '\n```\n' })
    }
  }

  parts.push({ type: 'text', text })

  if (hasImages) return parts
  return text + '\n\n' + parts.filter(p => p.type === 'text').map(p => p.text).join('')
}

export const ALL_ACCEPT_TYPES = 'image/*,.pdf,.docx,.xlsx,.xls,.csv,.html,.htm,.js,.ts,.jsx,.tsx,.py,.rs,.go,.java,.c,.cpp,.css,.json,.yaml,.yml,.md,.txt,.sh,.sql,.toml,.xml,.graphql,.prisma,.env'
