const CACHE_PREFIXES = ['morpheus-', 'workbox-', 'vite-']

async function limparCachesAntigos() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await limparCachesAntigos()
    await self.clients.claim()
    await self.registration.unregister()
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      client.postMessage({ type: 'SW_DISABLED' })
      client.navigate(client.url)
    }
  })())
})

self.addEventListener('fetch', () => {
  // Service worker desativado propositalmente para evitar clientes presos em bundle obsoleto.
})
