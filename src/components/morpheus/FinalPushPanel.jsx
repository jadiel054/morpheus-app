import { useState } from 'react'
import { GitPullRequest, Check, Loader2, ExternalLink } from 'lucide-react'
import { fullFixPipeline } from '../../lib/gitPushHandler'

export function FinalPushPanel({ repoName, filePath, newContent, issueDescription, githubToken, onComplete, onClose }) {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handlePush = async () => {
    if (!repoName || !filePath || !githubToken) {
      setError('Configuracao incompleta: repo, arquivo e token GitHub obrigatorios.')
      return
    }
    setStatus('pushing')
    setError(null)
    try {
      const res = await fullFixPipeline(repoName, filePath, newContent, issueDescription, githubToken)
      setResult(res)
      setStatus('done')
      if (onComplete) onComplete(res)
    } catch (err) {
      setError(err.message)
      setStatus('failed')
    }
  }

  return (
    <div className="final-push-panel">
      <style>{`
        .final-push-panel { border: 1px solid rgba(0,255,100,0.2); border-radius: 8px; padding: 16px; margin: 12px 0; background: rgba(0,255,100,0.03); }
        .push-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .push-title { font-size: 0.75rem; color: #00ff66; }
        .push-description { font-size: 0.65rem; opacity: 0.6; margin-bottom: 12px; }
        .push-file-info { font-size: 0.6rem; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; font-family: monospace; }
        .push-actions { display: flex; gap: 8px; }
        .push-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; border: 1px solid #00ff66; background: rgba(0,255,100,0.1); color: #00ff66; cursor: pointer; font-family: inherit; font-size: 0.7rem; transition: all 0.15s; }
        .push-btn:hover { background: rgba(0,255,100,0.2); }
        .push-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .push-cancel-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--dark-border); background: none; color: var(--cyan); cursor: pointer; font-family: inherit; font-size: 0.7rem; opacity: 0.5; }
        .push-result { margin-top: 12px; padding: 10px; background: rgba(0,255,100,0.05); border-radius: 6px; font-size: 0.65rem; }
        .push-result-link { color: var(--cyan); text-decoration: underline; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        .push-error { margin-top: 12px; padding: 10px; background: rgba(255,0,0,0.05); border-radius: 6px; font-size: 0.65rem; color: #ff4444; }
      `}</style>

      <div className="push-header">
        <GitPullRequest size={16} color="#00ff66" />
        <span className="push-title">Push para Branch de Correcoes</span>
      </div>

      <div className="push-description">
        Criar branch fix/morpheus-*, commitar a correcao e abrir PR automaticamente.
      </div>

      <div className="push-file-info">
        repo: {repoName || '—'}<br />
        arquivo: {filePath || '—'}<br />
        issue: {issueDescription || '—'}
      </div>

      <div className="push-actions">
        <button className="push-btn" onClick={handlePush} disabled={status === 'pushing'}>
          {status === 'pushing' ? <Loader2 size={14} className="animate-spin" /> : status === 'done' ? <Check size={14} /> : <GitPullRequest size={14} />}
          {status === 'pushing' ? 'Enviando...' : status === 'done' ? 'Concluido' : 'Criar Branch + PR'}
        </button>
        <button className="push-cancel-btn" onClick={onClose}>Cancelar</button>
      </div>

      {result && (
        <div className="push-result">
          <div>Branch: <code>{result.branchName}</code></div>
          {result.prUrl ? (
            <a href={result.prUrl} target="_blank" rel="noopener" className="push-result-link">
              Ver Pull Request <ExternalLink size={10} />
            </a>
          ) : (
            <div style={{ opacity: 0.5 }}>{result.note || 'PR nao criado'}</div>
          )}
        </div>
      )}

      {error && <div className="push-error">{error}</div>}
    </div>
  )
}
