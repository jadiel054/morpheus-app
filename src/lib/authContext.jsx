import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    try {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return
        const s = data?.session ?? null
        setSession(s)
        setUser(s?.user ?? null)
        setAuthState(s ? 'authenticated' : 'unauthenticated')
        setLoading(false)
      }).catch((err) => {
        console.error('[Auth] getSession error:', err)
        if (!cancelled) {
          setAuthState('unauthenticated')
          setLoading(false)
        }
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
        if (cancelled) return
        setSession(s)
        setUser(s?.user ?? null)
        setAuthState(s ? 'authenticated' : 'unauthenticated')
        setLoading(false)
      })

      return () => {
        cancelled = true
        subscription?.unsubscribe()
      }
    } catch (err) {
      console.error('[Auth] Init error:', err)
      setAuthState('unauthenticated')
      setLoading(false)
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const signInWithMagicLink = useCallback(async (email) => {
    const { data, error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setSession(null)
    setAuthState('unauthenticated')
  }, [])

  if (loading) {
    return (
      <div style={{ background: '#050a0f', minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#00FFFF', fontFamily: 'monospace', textAlign: 'center' }}>
          <div className="ldrs-helix" style={{ margin: '0 auto 16px' }} />
          <div>MORPHEUS INICIALIZANDO...</div>
        </div>
      </div>
    )
  }

  const value = { user, session, loading, authState, signIn, signInWithMagicLink, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export default AuthContext
