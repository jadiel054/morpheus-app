import { useEffect } from 'react'

async function limparCachesAntigos() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith('morpheus-') || key.startsWith('workbox-') || key.startsWith('vite-'))
      .map((key) => caches.delete(key)),
  )
}

export function UpdateBanner() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let cancelled = false

    const limparServiceWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
        await limparCachesAntigos()
      } catch (error) {
        console.warn('[PWA] Falha ao limpar service workers antigos:', error)
      }
    }

    const handleMessage = async (event) => {
      if (event.data?.type === 'SW_DISABLED' && !cancelled) {
        await limparCachesAntigos()
        if (!sessionStorage.getItem('morpheus_sw_cleanup_reload')) {
          sessionStorage.setItem('morpheus_sw_cleanup_reload', '1')
          window.location.reload()
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    limparServiceWorkers()

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [])

  return null
}

export function useUpdateChecker() {
  return {
    hasUpdate: false,
    checkForUpdate: async () => false,
  }
}
