import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export function ResetPasswordModal({ onClose }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')

  const handleReset = async () => {
    if (newPassword !== confirm) { setStatus('Senhas nao coincidem'); return }
    if (newPassword.length < 6) { setStatus('Minimo 6 caracteres'); return }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setStatus('Erro: ' + error.message); return }
    setStatus('Senha alterada com sucesso!')
    setTimeout(() => {
      localStorage.removeItem('morpheus_password_recovery')
      onClose()
    }, 2000)
  }

  const inputStyle = {
    width: '100%',
    background: '#050a0f',
    border: '1px solid #0d2030',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#e2e8f0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(5,10,15,0.95)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#0a1520', border: '1px solid #0d2030',
        borderRadius: '12px', padding: '32px 24px', width: '100%', maxWidth: '400px',
      }}>
        <h2 style={{ color: '#00FFFF', fontFamily: 'monospace', marginBottom: '24px' }}>
          NOVA SENHA
        </h2>
        <input type="password" placeholder="Nova senha (min. 6 chars)"
          value={newPassword} onChange={e => setNewPassword(e.target.value)}
          style={inputStyle} />
        <input type="password" placeholder="Confirmar nova senha"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          style={{ ...inputStyle, marginTop: '12px' }} />
        {status && <p style={{ color: status.includes('sucesso') ? '#00FFFF' : '#ff0080',
          fontFamily: 'monospace', fontSize: '12px', marginTop: '12px' }}>{status}</p>}
        <button onClick={handleReset} style={{
          width: '100%', marginTop: '20px', padding: '14px',
          background: '#00FFFF', color: '#050a0f', border: 'none',
          borderRadius: '8px', fontFamily: 'monospace', fontWeight: '700',
          fontSize: '14px', cursor: 'pointer',
        }}>
          SALVAR NOVA SENHA
        </button>
      </div>
    </div>
  )
}
