import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { LoginScreen } from './LoginScreen'

export function LoginGate({ children }) {
  const { authState, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ background: '#050a0f', minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        <div className="ldrs-helix" />
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginScreen onLoggedIn={() => window.location.reload()} />
  }

  return children
}
