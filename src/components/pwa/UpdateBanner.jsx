import { useState, useEffect, useRef } from 'react'

export function UpdateBanner() {
  const [show, setShow]         = useState(false)
  const [checking, setChecking] = useState(false)
  const regRef                  = useRef(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(reg => {
        regRef.current = reg

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] Nova versao disponivel!')
              setShow(true)
            }
          })
        })

        const interval = setInterval(() => {
          reg.update().catch(() => {})
        }, 2 * 60 * 1000)

        return () => clearInterval(interval)
      })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  const handleUpdate = () => {
    const reg = regRef.current
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    setShow(false)
  }

  const handleCheckNow = async () => {
    setChecking(true)
    try {
      await regRef.current?.update()
      setTimeout(() => setChecking(false), 2000)
    } catch {
      setChecking(false)
    }
  }

  return (
    <>
      {show && (
        <div style={{
          position: 'fixed',
          top: '70px', left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: '#0a1520',
          border: '1px solid #00FFFF',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 30px rgba(0,255,255,0.2)',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#00FFFF',
          maxWidth: '90vw',
          animation: 'fade-in-up 0.3s ease-out',
          whiteSpace: 'nowrap',
        }}>
          <span>Nova versao disponivel!</span>
          <button onClick={handleUpdate} style={{
            background: '#00FFFF', color: '#050a0f',
            border: 'none', borderRadius: '6px',
            padding: '6px 14px', fontFamily: 'monospace',
            fontWeight: '700', fontSize: '11px', cursor: 'pointer',
          }}>
            ATUALIZAR
          </button>
          <button onClick={() => setShow(false)} style={{
            background: 'transparent', border: 'none',
            color: 'rgba(0,255,255,0.5)', cursor: 'pointer', fontSize: '16px',
          }}>X</button>
        </div>
      )}
    </>
  )
}

export function useUpdateChecker() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const regRef = useRef(null)

  useEffect(() => {
    navigator.serviceWorker?.getRegistration()
      .then(reg => { regRef.current = reg })
  }, [])

  const checkForUpdate = async () => {
    if (!regRef.current) return false
    await regRef.current.update()
    return !!regRef.current.waiting
  }

  return { hasUpdate, checkForUpdate }
}
