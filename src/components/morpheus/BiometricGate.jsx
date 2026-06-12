import { useState } from 'react'
const PIN_KEY = 'morpheus_emergency_pin'
const MAX = 5

export function BiometricGate({ onSuccess, onCancel }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const handleSubmit = (e) => { e.preventDefault(); const stored = localStorage.getItem(PIN_KEY) || '123456'; if (pin === stored) { setError(''); onSuccess?.() } else { const a = attempts + 1; setAttempts(a); setPin(''); setError(a >= MAX ? 'BLOQUEADO.' : 'PIN incorreto. ' + (MAX - a) + ' tentativas.') } }
  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-50 flex items-center justify-center">
      <div className="bg-dark-card border border-dark-border rounded-lg p-8 max-w-sm w-full">
        <h2 className="text-lg text-cyan font-bold mb-2 text-center">VERIFICACAO BIOMETRICA</h2>
        <p className="text-xs opacity-50 text-center mb-6">Digite o PIN de 6 digitos</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full bg-dark-bg border border-dark-border rounded px-3 py-3 text-center text-2xl text-cyan tracking-widest focus:border-cyan outline-none font-mono" autoFocus />
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button type="submit" className="w-full py-2 bg-cyan/10 border border-cyan rounded text-cyan text-sm hover:bg-cyan/20 font-mono" disabled={attempts >= MAX}>VERIFICAR</button>
          <button type="button" onClick={onCancel} className="w-full text-xs opacity-40 hover:opacity-70 text-center">Cancelar</button>
        </form>
      </div>
    </div>
  )
}
