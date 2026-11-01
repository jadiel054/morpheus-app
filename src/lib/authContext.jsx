import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  login as apiLogin,
  register as apiRegister,
  fetchMe,
  logout as apiLogout,
  getStoredToken,
  getStoredUser,
} from './authApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState('loading')

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const token = getStoredToken()
        const cached = getStoredUser()
        if (!token) {
          if (!cancelled) {
            setUser(null)
            setSession(null)
            setAuthState('unauthenticated')
          }
          return
        }
        if (cached && !cancelled) {
          setUser(cached)
          setSession({ access_token: token, user: cached })
          setAuthState('authenticated')
        }
        const me = await fetchMe()
        if (cancelled) return
        if (me?.user) {
          setUser(me.user)
          setSession({ access_token: token, user: me.user })
          setAuthState('authenticated')
        } else {
          apiLogout()
          setUser(null)
          setSession(null)
          setAuthState('unauthenticated')
        }
      } catch (err) {
        console.error('[Auth] init error:', err)
        apiLogout()
        if (!cancelled) {
          setUser(null)
          setSession(null)
          setAuthState('unauthenticated')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const data = await apiLogin({ email, password })
    setUser(data.user)
    setSession({ access_token: data.access_token, user: data.user })
    setAuthState('authenticated')
    return data
  }, [])

  const signUp = useCallback(async (email, password, name) => {
    const data = await apiRegister({ email, password, name })
    setUser(data.user)
    setSession({ access_token: data.access_token, user: data.user })
    setAuthState('authenticated')
    return data
  }, [])

  const signInWithMagicLink = useCallback(async () => {
    throw new Error('Magic link desativado. Use email e senha (auth Neon).')
  }, [])

  const signOut = useCallback(async () => {
    apiLogout()
    setUser(null)
    setSession(null)
    setAuthState('unauthenticated')
  }, [])

  const value = {
    user,
    session,
    loading,
    authState,
    signIn,
    signUp,
    signInWithMagicLink,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div style={{
          background: '#050a0f',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ color: '#00FFFF', fontFamily: 'monospace', textAlign: 'center' }}>
            <div className="ldrs-helix" style={{ margin: '0 auto 16px' }} />
            <div>MORPHEUS INICIALIZANDO...</div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export default AuthContext
