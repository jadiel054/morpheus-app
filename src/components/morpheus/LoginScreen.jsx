import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export function LoginScreen({ onLoggedIn }) {
  const [mode,     setMode]     = useState('login')  // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

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
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name || email.split('@')[0] }
          }
        })
        if (signUpError) throw signUpError
        if (data.session) {
          onLoggedIn(data.session.user)
          return
        }
        setSuccess('Conta criada! Verifique seu email para confirmar.')
        setMode('login')
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (signInError) throw signInError
        onLoggedIn(data.user)
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('Invalid login credentials'))
        setError('Email ou senha incorretos')
      else if (msg.includes('Email not confirmed'))
        setError('Confirme seu email antes de entrar')
      else if (msg.includes('User already registered'))
        setError('Este email ja tem uma conta. Faca login.')
      else if (msg.includes('Password should be'))
        setError('Senha deve ter no minimo 6 caracteres')
      else
        setError(msg || 'Erro ao processar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!email) { setError('Digite seu email primeiro'); return }
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email })
      if (error) throw error
      setSuccess(`Magic link enviado para ${email}`)
    } catch (err) {
      setError(err.message || 'Erro ao enviar magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#050a0f',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
      padding: '20px'
    }}>
      <div style={{
        background: '#0a1520',
        border: '1px solid #0d2030',
        borderRadius: '12px',
        padding: '32px 24px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 0 40px rgba(0,255,255,0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            color: '#00FFFF',
            fontSize: '28px',
            fontWeight: '900',
            letterSpacing: '4px',
            fontFamily: "'Orbitron', monospace",
            marginBottom: '6px'
          }}>
            MORPHEUS
          </h1>
          <p style={{ color: 'rgba(0,255,255,0.5)', fontSize: '11px', letterSpacing: '2px' }}>
            NEBUCHADNEZZAR v1.0
          </p>
        </div>

        <div style={{
          display: 'flex',
          background: '#050a0f',
          borderRadius: '8px',
          padding: '4px',
          marginBottom: '24px',
          border: '1px solid #0d2030'
        }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setSuccess('') }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                background: mode === m ? '#00FFFF' : 'transparent',
                color: mode === m ? '#050a0f' : 'rgba(0,255,255,0.5)',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: mode === m ? '700' : '400',
                fontSize: '12px',
                letterSpacing: '1px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {m === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              color: 'rgba(0,255,255,0.7)',
              fontSize: '11px',
              letterSpacing: '2px',
              display: 'block',
              marginBottom: '8px'
            }}>
              NOME
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome"
              style={{
                width: '100%',
                background: '#050a0f',
                border: '1px solid #0d2030',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#e2e8f0',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={e => e.target.style.borderColor = '#00FFFF'}
              onBlur={e => e.target.style.borderColor = '#0d2030'}
            />
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            color: 'rgba(0,255,255,0.7)',
            fontSize: '11px',
            letterSpacing: '2px',
            display: 'block',
            marginBottom: '8px'
          }}>
            EMAIL
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            style={{
              width: '100%',
              background: '#050a0f',
              border: '1px solid #0d2030',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#e2e8f0',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onFocus={e => e.target.style.borderColor = '#00FFFF'}
            onBlur={e => e.target.style.borderColor = '#0d2030'}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{
            color: 'rgba(0,255,255,0.7)',
            fontSize: '11px',
            letterSpacing: '2px',
            display: 'block',
            marginBottom: '8px'
          }}>
            SENHA
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'Minimo 6 caracteres' : '........'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{
              width: '100%',
              background: '#050a0f',
              border: '1px solid #0d2030',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#e2e8f0',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onFocus={e => e.target.style.borderColor = '#00FFFF'}
            onBlur={e => e.target.style.borderColor = '#0d2030'}
          />
        </div>

        {error && (
          <div style={{
            color: '#ff0080',
            fontSize: '12px',
            marginBottom: '16px',
            padding: '10px 12px',
            background: 'rgba(255,0,128,0.08)',
            borderRadius: '6px',
            border: '1px solid rgba(255,0,128,0.2)'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            color: '#00FFFF',
            fontSize: '12px',
            marginBottom: '16px',
            padding: '10px 12px',
            background: 'rgba(0,255,255,0.08)',
            borderRadius: '6px',
            border: '1px solid rgba(0,255,255,0.2)'
          }}>
            {success}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: loading ? 'rgba(0,255,255,0.3)' : '#00FFFF',
            color: '#050a0f',
            border: 'none',
            borderRadius: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: '700',
            fontSize: '14px',
            letterSpacing: '2px',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '16px',
            transition: 'all 0.2s'
          }}
        >
          {loading
            ? 'PROCESSANDO...'
            : mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'
          }
        </button>

        <button
          onClick={handleMagicLink}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: 'rgba(0,255,255,0.6)',
            border: '1px solid rgba(0,255,255,0.2)',
            borderRadius: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer'
          }}
        >
          USAR MAGIC LINK
        </button>
      </div>
    </div>
  )
}
