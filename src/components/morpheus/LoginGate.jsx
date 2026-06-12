import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'

export function LoginGate({ children }) {
  const { authState, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><div className="ldrs-helix" /></div>
  if (authState === 'unauthenticated') return <Navigate to="/Morpheus" replace />
  return children
}
