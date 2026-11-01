import getApiBaseUrl from './apiBaseUrl'

const TOKEN_KEY = 'morpheus_access_token'
const USER_KEY = 'morpheus_user'

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function persistAuth(accessToken, user) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function authFetch(path, options = {}, { retries = 2 } = {}) {
  const base = getApiBaseUrl().replace(/\/$/, '')
  const url = `${base}${path}`
  let lastErr

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Give Render free tier time to wake
        await sleep(2500 * attempt)
      }
      const res = await fetchWithTimeout(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`
        const err = new Error(msg)
        err.status = res.status
        throw err
      }
      return data
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || err)
      const isNetwork =
        err?.name === 'AbortError'
        || msg.includes('Failed to fetch')
        || msg.includes('NetworkError')
        || msg.includes('Load failed')
        || msg.includes('network')
      if (!isNetwork || attempt === retries) {
        if (err?.name === 'AbortError') {
          throw new Error(
            'A API demorou demais (cold start no Render). Aguarde ~1 min e tente de novo.'
          )
        }
        if (isNetwork) {
          throw new Error(
            'Nao foi possivel falar com a API. Verifique a internet e se o Morpheus API (Render) esta no ar. Em 3G lento o cold start pode levar 1 min.'
          )
        }
        throw err
      }
    }
  }
  throw lastErr
}

/** Wake Render free tier before login/register */
export async function warmupApi() {
  try {
    const base = getApiBaseUrl().replace(/\/$/, '')
    await fetchWithTimeout(`${base}/api/auth/status`, { method: 'GET' }, 60000)
  } catch {
    // ignore — login will retry
  }
}

export async function register({ email, password, name }) {
  const data = await authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  })
  persistAuth(data.access_token, data.user)
  return data
}

export async function login({ email, password }) {
  const data = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  persistAuth(data.access_token, data.user)
  return data
}

export async function fetchMe() {
  const token = getStoredToken()
  if (!token) return null
  const data = await authFetch(
    '/api/auth/me',
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    { retries: 1 }
  )
  if (data?.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  }
  return data
}

export function logout() {
  clearAuth()
}
