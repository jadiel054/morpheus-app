const CACHE_VERSION = 'morpheus-v12'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const KOKORO_CACHE  = 'morpheus-kokoro-v1'

const PRECACHE_ASSETS = ['/', '/index.html']

// Install: pre-cacheia assets
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versao:', CACHE_VERSION)
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate: limpa caches antigos (exceto Kokoro)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== KOKORO_CACHE)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch: Network First para HTML/JS/CSS, Cache First para Kokoro
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Kokoro model: sempre cache (nunca re-baixar)
  if (url.href.includes('Kokoro-82M-ONNX') || url.href.includes('kokoro')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request))
    )
    return
  }

  // APIs e terceiros: sempre network
  if (url.origin !== self.location.origin) return

  // Assets locais: Network First com cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(STATIC_CACHE)
            .then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// Mensagens do app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Ativando nova versao...')
    self.skipWaiting()
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION })
  }
})
