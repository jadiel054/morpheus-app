import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'morpheus_install_btn_pos'

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable]   = useState(false)
  const [isInstalled,   setIsInstalled]     = useState(false)
  const [collapsed,     setCollapsed]       = useState(false)
  const [isDragging,    setIsDragging]      = useState(false)
  const [pos, setPos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { x: null, y: null }
    } catch { return { x: null, y: null } }
  })
  const dragRef    = useRef(null)
  const offsetRef  = useRef({ x: 0, y: 0 })
  const collapseTimer = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
      collapseTimer.current = setTimeout(() => setCollapsed(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setIsInstallable(false)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(collapseTimer.current)
    }
  }, [])

  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    const rect  = dragRef.current.getBoundingClientRect()
    offsetRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }
    setIsDragging(true)
  }

  const handleTouchMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const touch = e.touches[0]
    const newX = touch.clientX - offsetRef.current.x
    const newY = touch.clientY - offsetRef.current.y
    const maxX = window.innerWidth  - (collapsed ? 48 : 180)
    const maxY = window.innerHeight - (collapsed ? 48 : 52)
    const clampedX = Math.max(0, Math.min(newX, maxX))
    const clampedY = Math.max(0, Math.min(newY, maxY))
    setPos({ x: clampedX, y: clampedY })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  }

  const handleClick = async () => {
    if (isDragging) return
    if (collapsed) {
      setCollapsed(false)
      clearTimeout(collapseTimer.current)
      collapseTimer.current = setTimeout(() => setCollapsed(true), 5000)
      return
    }
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

  const style = {
    position: 'fixed',
    left: pos.x !== null ? `${pos.x}px` : 'auto',
    right: pos.x !== null ? 'auto' : '16px',
    top:  pos.y !== null ? `${pos.y}px` : 'auto',
    bottom: pos.y !== null ? 'auto' : '100px',
    zIndex: 999,
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    touchAction: 'none',
    transition: isDragging ? 'none' : 'all 0.3s ease',
  }

  return (
    <div
      ref={dragRef}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {collapsed ? (
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #00FFFF, #7B61FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', boxShadow: '0 4px 20px rgba(0,255,255,0.4)',
        }}>
          +
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, #00FFFF, #7B61FF)',
          borderRadius: '12px', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 20px rgba(0,255,255,0.3)',
          fontFamily: 'monospace', fontWeight: '700',
          fontSize: '12px', color: '#050a0f', letterSpacing: '1px',
          whiteSpace: 'nowrap',
        }}>
          INSTALAR MORPHEUS
        </div>
      )}
    </div>
  )
}
