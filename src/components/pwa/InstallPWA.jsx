import { useState, useEffect } from 'react'

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setIsInstallable(false)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setIsInstallable(false)
    }
    setDeferredPrompt(null)
  }

  if (isInstalled || !isInstallable) return null

  return (
    <button onClick={handleInstall} style={{
      position: 'fixed',
      bottom: '90px',
      right: '16px',
      zIndex: 999,
      background: 'linear-gradient(135deg, #00FFFF, #7B61FF)',
      border: 'none',
      borderRadius: '12px',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(0,255,255,0.3)',
      fontFamily: 'monospace',
      fontWeight: '700',
      fontSize: '12px',
      color: '#050a0f',
      letterSpacing: '1px',
      animation: 'fade-in-up 0.4s ease-out',
    }}>
      INSTALAR MORPHEUS
    </button>
  )
}
