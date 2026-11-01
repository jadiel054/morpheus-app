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

async function authFetch(path, options = {}) {
  const base = getApiBaseUrl().replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, {
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
  const data = await authFetch('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (data?.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  }
  return data
}

export function logout() {
  clearAuth()
}
