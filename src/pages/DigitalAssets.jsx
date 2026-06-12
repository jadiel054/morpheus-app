import { useState } from 'react'

export default function DigitalAssets() {
  const [assets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('morpheus_digital_assets') || '[]') } catch { return [] }
  })
  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <h1 className="text-xl text-cyan font-bold mb-6">DIGITAL ASSETS</h1>
      {assets.length === 0 ? <p className="text-sm opacity-60">Nenhum ativo registrado.</p> : (
        <div className="grid gap-4">
          {assets.map((a, i) => (
            <div key={i} className="bg-dark-card border border-dark-border rounded-lg p-4">
              <span className="text-sm text-cyan">{a.name}</span>
              <span className="text-xs opacity-50 ml-4">{a.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
