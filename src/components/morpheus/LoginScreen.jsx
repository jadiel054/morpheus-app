import { useState } from 'react'
import { useAuth } from '../../lib/authContext'

export function LoginScreen({ onLoggedIn }) {
  const { signIn, signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState('password')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'magic') { await signInWithMagicLink(email); setError('Magic link enviado! Verifique seu email.') }
      else { await signIn(email, password); onLoggedIn?.() }
    } catch (err) { setError(err.message || 'Erro de autenticacao') }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="text-2xl font-bold text-cyan text-center mb-2">MORPHEUS</h1>
        <p className="text-xs opacity-50 text-center mb-8">NEBUCHADNEZZAR v1.0</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs opacity-60 block mb-1">EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan focus:border-cyan outline-none font-mono"
              placeholder="jadiel@exemplo.com" required />
          </div>
          {mode === 'password' && (
            <div>
              <label className="text-xs opacity-60 block mb-1">SENHA</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-cyan focus:border-cyan outline-none font-mono" required />
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" className="w-full py-2 bg-cyan/10 border border-cyan rounded text-cyan text-sm hover:bg-cyan/20 transition-colors font-mono">
            {mode === 'magic' ? 'ENVIAR MAGIC LINK' : 'ENTRAR'}
          </button>
        </form>
        <button onClick={() => setMode(m => m === 'password' ? 'magic' : 'password')}
          className="w-full mt-3 text-xs opacity-40 hover:opacity-70 text-center">
          {mode === 'password' ? 'Usar magic link' : 'Usar senha'}
        </button>
      </div>
    </div>
  )
}
