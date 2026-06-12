import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function UpdateBanner({ onUpdate, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const handler = () => setVisible(true)
      navigator.serviceWorker.addEventListener('controllerchange', handler)
      navigator.serviceWorker.ready.then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setVisible(true)
              }
            })
          }
        })
      })
      return () => navigator.serviceWorker.removeEventListener('controllerchange', handler)
    }
  }, [])

  const handleUpdate = async () => {
    setUpdating(true)
    if (onUpdate) {
      await onUpdate()
    } else if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      window.location.reload()
    } else {
      window.location.reload()
    }
    setUpdating(false)
  }

  if (!visible) return null

  return (
    <div className="update-banner">
      <style>{`
        .update-banner { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--dark-card); border: 1px solid var(--cyan); border-radius: 10px; padding: 14px 22px; display: flex; align-items: center; gap: 14px; z-index: 9999; font-size: 0.75rem; box-shadow: 0 0 30px rgba(0,255,255,0.15); animation: fade-in-up 0.3s ease-out; max-width: 90vw; }
        .update-banner-text { display: flex; flex-direction: column; gap: 2px; }
        .update-banner-title { color: var(--cyan); font-weight: 600; }
        .update-banner-desc { font-size: 0.65rem; opacity: 0.5; }
        .update-btn { display: flex; align-items: center; gap: 6px; background: var(--cyan); color: var(--dark-bg); border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 0.7rem; font-weight: 600; transition: all 0.15s; }
        .update-btn:hover { box-shadow: 0 0 15px rgba(0,255,255,0.3); }
        .update-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .update-dismiss { background: none; border: none; color: var(--cyan); cursor: pointer; opacity: 0.4; padding: 4px; }
        .update-dismiss:hover { opacity: 0.8; }
      `}</style>

      <div className="update-banner-text">
        <span className="update-banner-title">Nova versao disponivel</span>
        <span className="update-banner-desc">Atualize para receber as ultimas melhorias.</span>
      </div>

      <button className="update-btn" onClick={handleUpdate} disabled={updating}>
        {updating ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {updating ? 'Atualizando...' : 'Atualizar'}
      </button>

      <button className="update-dismiss" onClick={() => { setVisible(false); if (onDismiss) onDismiss() }}>
        <X size={14} />
      </button>
    </div>
  )
}
