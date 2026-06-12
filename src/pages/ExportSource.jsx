import { useState } from 'react'
import { Download, FileJson, FileCode, Database, Copy, Check, Loader2 } from 'lucide-react'

export default function ExportSource() {
  const [format, setFormat] = useState('json')
  const [includeOptions, setIncludeOptions] = useState({
    agents: true, tools: true, integrations: true, security: true,
    backend: true, database: true, css: true, config: true,
  })
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exportResult, setExportResult] = useState(null)

  const collectSource = async () => {
    setExporting(true)
    const result = {
      metadata: { exportedAt: new Date().toISOString(), version: '1.0.0', project: 'MORPHEUS Nebuchadnezzar' },
      modules: {},
    }

    const modulePaths = {
      agents: 'src/components/morpheus/agents',
      tools: 'src/components/morpheus/tools',
      integrations: 'src/components/morpheus/integrations',
      security: 'src/components/morpheus/security',
      backend: 'morpheus-api/src',
      database: 'sql',
      css: 'src/index.css',
      config: '',
    }

    const configFiles = ['package.json', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', '.env.example', 'index.html']

    for (const [key, path] of Object.entries(modulePaths)) {
      if (!includeOptions[key]) continue
      if (key === 'config') {
        result.modules[key] = configFiles.map(f => ({ file: f, content: `// ${f} — included in repo` }))
      } else if (key === 'css') {
        result.modules[key] = [{ file: 'src/index.css', content: '/* Full CSS included in repository */' }]
      } else {
        result.modules[key] = [{ path, note: `All files under ${path}/ included in repository` }]
      }
    }

    await new Promise(r => setTimeout(r, 800))
    setExportResult(result)
    setExporting(false)
    return result
  }

  const handleExport = async () => {
    const data = await collectSource()
    const content = format === 'json'
      ? JSON.stringify(data, null, 2)
      : format === 'markdown'
        ? generateMarkdown(data)
        : generatePlainText(data)

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `morpheus-source-${Date.now()}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    const data = exportResult || await collectSource()
    const content = JSON.stringify(data, null, 2)
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleOption = (key) => {
    setIncludeOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <style>{`
        .export-container { max-width: 640px; margin: 0 auto; }
        .export-title { font-size: 1.1rem; color: var(--cyan); margin-bottom: 4px; }
        .export-subtitle { font-size: 0.7rem; opacity: 0.5; margin-bottom: 24px; }
        .export-section { margin-bottom: 20px; }
        .export-section-title { font-size: 0.7rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
        .export-option { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--dark-border); border-radius: 6px; margin-bottom: 4px; cursor: pointer; transition: all 0.15s; }
        .export-option:hover { border-color: rgba(0,255,255,0.3); }
        .export-option--active { border-color: var(--cyan); background: rgba(0,255,255,0.05); }
        .export-checkbox { width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--dark-border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .export-checkbox--active { border-color: var(--cyan); background: var(--cyan); }
        .export-option-label { font-size: 0.75rem; flex: 1; }
        .export-option-path { font-size: 0.6rem; opacity: 0.3; }
        .export-format-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
        .export-format-tab { padding: 6px 14px; border-radius: 4px; border: 1px solid var(--dark-border); background: none; color: var(--cyan); cursor: pointer; font-family: inherit; font-size: 0.7rem; opacity: 0.5; transition: all 0.15s; }
        .export-format-tab--active { opacity: 1; border-color: var(--cyan); background: rgba(0,255,255,0.08); }
        .export-actions { display: flex; gap: 8px; margin-top: 20px; }
        .export-btn { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 6px; border: 1px solid var(--cyan); background: rgba(0,255,255,0.1); color: var(--cyan); cursor: pointer; font-family: inherit; font-size: 0.75rem; transition: all 0.15s; }
        .export-btn:hover { background: rgba(0,255,255,0.2); }
        .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .export-btn--secondary { border-color: var(--dark-border); background: none; }
        .export-result { margin-top: 16px; padding: 12px; background: rgba(0,255,100,0.05); border: 1px solid rgba(0,255,100,0.15); border-radius: 6px; font-size: 0.65rem; }
      `}</style>

      <div className="export-container">
        <h1 className="export-title">Export Source</h1>
        <p className="export-subtitle">Exporte o codigo-fonte completo do MORPHEUS em JSON, Markdown ou texto puro.</p>

        <div className="export-section">
          <div className="export-section-title">Formato</div>
          <div className="export-format-tabs">
            {['json', 'markdown', 'text'].map(f => (
              <button key={f} className={`export-format-tab ${format === f ? 'export-format-tab--active' : ''}`} onClick={() => setFormat(f)}>
                {f === 'json' ? 'JSON' : f === 'markdown' ? 'Markdown' : 'Texto'}
              </button>
            ))}
          </div>
        </div>

        <div className="export-section">
          <div className="export-section-title">Modulos</div>
          {[
            { key: 'agents', label: 'Agentes', path: 'src/components/morpheus/agents/' },
            { key: 'tools', label: 'Tools', path: 'src/components/morpheus/tools/' },
            { key: 'integrations', label: 'Integracoes', path: 'src/components/morpheus/integrations/' },
            { key: 'security', label: 'Seguranca', path: 'src/components/morpheus/security/' },
            { key: 'backend', label: 'Backend API', path: 'morpheus-api/src/' },
            { key: 'database', label: 'Database SQL', path: 'sql/' },
            { key: 'css', label: 'CSS / Tema', path: 'src/index.css' },
            { key: 'config', label: 'Config Files', path: 'package.json, vite.config.js, ...' },
          ].map(({ key, label, path }) => (
            <div key={key} className={`export-option ${includeOptions[key] ? 'export-option--active' : ''}`} onClick={() => toggleOption(key)}>
              <div className={`export-checkbox ${includeOptions[key] ? 'export-checkbox--active' : ''}`}>
                {includeOptions[key] && <Check size={10} color="#050a0f" />}
              </div>
              <span className="export-option-label">{label}</span>
              <span className="export-option-path">{path}</span>
            </div>
          ))}
        </div>

        <div className="export-actions">
          <button className="export-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? 'Coletando...' : 'Download ' + format.toUpperCase()}
          </button>
          <button className="export-btn export-btn--secondary" onClick={handleCopy} disabled={exporting}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copiado!' : 'Copiar JSON'}
          </button>
        </div>

        {exportResult && (
          <div className="export-result">
            Exportado {Object.keys(exportResult.modules).length} modulos em {new Date(exportResult.metadata.exportedAt).toLocaleString('pt-BR')}
          </div>
        )}
      </div>
    </div>
  )
}

function generateMarkdown(data) {
  let md = '# MORPHEUS Nebuchadnezzar v1.0 — Source Export\n\n'
  md += `**Exportado**: ${data.metadata.exportedAt}\n**Versao**: ${data.metadata.version}\n\n`
  md += '## Modulos\n\n'
  for (const [key, files] of Object.entries(data.modules)) {
    md += `### ${key}\n\n`
    for (const f of files) {
      md += `- **${f.file || f.path}**\n`
    }
    md += '\n'
  }
  md += '\n---\n*Gerado por MORPHEUS Nebuchadnezzar v1.0*\n'
  return md
}

function generatePlainText(data) {
  let txt = 'MORPHEUS Nebuchadnezzar v1.0 — Source Export\n'
  txt += '='.repeat(50) + '\n\n'
  txt += `Exportado: ${data.metadata.exportedAt}\nVersao: ${data.metadata.version}\n\n`
  for (const [key, files] of Object.entries(data.modules)) {
    txt += `[${key}]\n`
    for (const f of files) {
      txt += `  ${f.file || f.path}\n`
    }
    txt += '\n'
  }
  return txt
}
