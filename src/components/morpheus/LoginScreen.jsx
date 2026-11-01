import { useState, useEffect } from 'react'
import { login, register, warmupApi } from '../../lib/authApi'

export function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [warming, setWarming] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setWarming(true)
      await warmupApi()
      if (!cancelled) setWarming(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleForgotPassword = async () => {
    setError('Recuperacao de senha por email ainda nao esta ativa no auth Neon. Crie uma nova conta ou redefina via operador.')
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!email || !password) {
      setError('Preencha email e senha')
      return
    }
    if (password.length < 6) {
      setError('Senha deve ter no minimo 6 caracteres')
      return
    }
    setLoading(true)
    try {
      // Ensure API is awake before auth
      await warmupApi()
      if (mode === 'register') {
        const data = await register({ email, password, name })
        setSuccess('Conta criada com sucesso')
        onLoggedIn?.(data.user)
      } else {
        const data = await login({ email, password })
        onLoggedIn?.(data.user)
      }
    } catch (err) {
      const msg = err.message || ''
      setError(msg || 'Erro ao processar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    setError('Magic link desativado. Use email e senha (auth Neon).')
  }

  return (
    <div style={{
      background: '#050a0f',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
      padding: '20px',
    }}>
      <div style={{
        background: '#0a1520',
        border: '1px solid #0d2030',
        borderRadius: '12px',
        padding: '32px 24px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 0 40px rgba(0,255,255,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ color: '#00FFFF', fontSize: '28px', fontWeight: '900', margin: 0, letterSpacing: '0.12em' }}>
            MORPHEUS
          </h1>
          <p style={{ color: '#3a6a7a', fontSize: '11px', marginTop: '8px', letterSpacing: '0.2em' }}>
            NEBUCHADNEZZAR v1.0
          </p>
        </div>

        {warming && (
          <div style={{
            background: '#0a1820', border: '1px solid #1a4050', color: '#5ad0e0',
            borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px',
          }}>
            Acordando API no Render (cold start)... aguarde ate ~1 min em 3G.
          </div>
        )}

        <div style={{ display: 'flex', marginBottom: '20px', background: '#061018', borderRadius: '8px', padding: '4px' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
            style={{
              flex: 1, border: 'none', borderRadius: '6px', padding: '10px',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              background: mode === 'login' ? '#00FFFF' : 'transparent',
              color: mode === 'login' ? '#050a0f' : '#6a9aaa',
            }}
          >
            ENTRAR
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); setSuccess('') }}
            style={{
              flex: 1, border: 'none', borderRadius: '6px', padding: '10px',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              background: mode === 'register' ? '#00FFFF' : 'transparent',
              color: mode === 'register' ? '#050a0f' : '#6a9aaa',
            }}
          >
            CRIAR CONTA
          </button>
        </div>

        {mode === 'register' && (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            <span style={{ color: '#3a8a9a', fontSize: '11px', letterSpacing: '0.08em' }}>NOME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              style={inputStyle}
            />
          </label>
        )}

        <label style={{ display: 'block', marginBottom: '14px' }}>
          <span style={{ color: '#3a8a9a', fontSize: '11px', letterSpacing: '0.08em' }}>EMAIL</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            autoComplete="email"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '18px' }}>
          <span style={{ color: '#3a8a9a', fontSize: '11px', letterSpacing: '0.08em' }}>SENHA</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{
            background: '#2a0a18', border: '1px solid #5a2030', color: '#ff6b8a',
            borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: '#0a2018', border: '1px solid #1a5a40', color: '#5dffb0',
            borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px',
          }}>
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', border: 'none', borderRadius: '8px', padding: '14px',
            background: '#00FFFF', color: '#050a0f', fontWeight: 800,
            fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer', marginBottom: '10px',
          }}
        >
          {loading ? 'Aguarde (API pode demorar no Render)...' : mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
        </button>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
          style={{
            width: '100%', border: '1px solid #1a3040', borderRadius: '8px', padding: '12px',
            background: 'transparent', color: '#5a8a9a', fontFamily: 'inherit',
            cursor: 'pointer', marginBottom: '12px',
          }}
        >
          USAR MAGIC LINK
        </button>

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleForgotPassword}
            style={{
              background: 'none', border: 'none', color: '#3a9aaa', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px', textDecoration: 'underline',
            }}
          >
            Esqueci minha senha
          </button>
        </div>

        <p style={{ color: '#2a4a55', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          Auth Neon · API Render (cold start ate ~60s)
        </p>
      </div>
    </div>
  )
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: '6px',
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid #1a3040',
  background: '#f4f7fa',
  color: '#0a1520',
  fontFamily: 'inherit',
  fontSize: '14px',
  boxSizing: 'border-box',
}

export default LoginScreen
