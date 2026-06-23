const FALLBACK_RENDER_API_URL = 'https://morpheus-api.onrender.com'

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && String(envUrl).trim()) return String(envUrl).trim()

  if (typeof window === 'undefined') return FALLBACK_RENDER_API_URL

  const { origin, hostname } = window.location
  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.onrender.com')
  ) {
    return origin
  }

  return FALLBACK_RENDER_API_URL
}

export default getApiBaseUrl
