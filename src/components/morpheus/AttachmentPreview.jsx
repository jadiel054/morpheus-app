import { X, FileText, Image, FileCode, FileSpreadsheet, Link } from 'lucide-react'

const TYPE_ICONS = {
  image: Image, pdf: FileText, word: FileText, excel: FileSpreadsheet,
  csv: FileSpreadsheet, html: FileCode, code: FileCode, text: FileText, link: Link,
}

const TYPE_LABELS = {
  image: 'Imagem', pdf: 'PDF', word: 'Word', excel: 'Excel',
  csv: 'CSV', html: 'HTML', code: 'Codigo', text: 'Texto', link: 'Link',
}

export function AttachmentPreview({ attachments = [], onRemove }) {
  if (!attachments?.length) return null

  return (
    <div className="attachment-preview-bar">
      <style>{`
        .attachment-preview-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--dark-border); background: rgba(0,0,0,0.2); }
        .attachment-chip { display: flex; align-items: center; gap: 6px; background: var(--dark-card); border: 1px solid var(--dark-border); border-radius: 6px; padding: 4px 8px; font-size: 0.65rem; max-width: 200px; }
        .attachment-chip:hover { border-color: rgba(0,255,255,0.3); }
        .attachment-thumb { width: 28px; height: 28px; border-radius: 4px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--dark-border); }
        .attachment-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(0,255,255,0.05); border-radius: 4px; flex-shrink: 0; color: var(--cyan); opacity: 0.6; }
        .attachment-info { display: flex; flex-direction: column; overflow: hidden; }
        .attachment-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--cyan); }
        .attachment-type { font-size: 0.55rem; opacity: 0.5; }
        .attachment-remove { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(255,0,0,0.1); color: rgba(255,0,0,0.6); cursor: pointer; flex-shrink: 0; font-size: 0.6rem; transition: all 0.15s; }
        .attachment-remove:hover { background: rgba(255,0,0,0.2); color: rgba(255,0,0,0.9); }
        .attachment-size { font-size: 0.5rem; opacity: 0.3; }
      `}</style>
      {attachments.map((att, i) => {
        const Icon = TYPE_ICONS[att.type] || FileText
        const label = TYPE_LABELS[att.type] || 'Arquivo'
        const sizeStr = att.size ? (att.size > 1024 * 1024 ? (att.size / (1024 * 1024)).toFixed(1) + 'MB' : (att.size / 1024).toFixed(0) + 'KB') : ''
        return (
          <div key={att.id || i} className="attachment-chip">
            {att.type === 'image' && att.preview ? (
              <img src={att.preview} alt={att.name} className="attachment-thumb" />
            ) : (
              <div className="attachment-icon"><Icon size={14} /></div>
            )}
            <div className="attachment-info">
              <span className="attachment-name" title={att.name}>{att.name}</span>
              <span className="attachment-type">{label}{sizeStr ? ' · ' + sizeStr : ''}</span>
            </div>
            {onRemove && (
              <button className="attachment-remove" onClick={() => onRemove(i)} title="Remover">
                <X size={10} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
