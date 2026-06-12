import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SecurityBlock() {
  const navigate = useNavigate()
  useEffect(() => { const t = setTimeout(() => navigate('/'), 5000); return () => clearTimeout(t) }, [navigate])
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center">
        <div className="ldrs-helix mx-auto mb-6" />
        <h1 className="text-xl text-red-500 font-bold mb-2">ACESSO BLOQUEADO</h1>
        <p className="text-sm opacity-60">Dispositivo nao reconhecido. Redirecionando...</p>
      </div>
    </div>
  )
}
