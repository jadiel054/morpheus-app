import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[MORPHEUS] Erro critico:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#050a0f',
          color: '#00FFFF',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
            MORPHEUS — ERRO DE INICIALIZACAO
          </h1>
          <p style={{ color: '#ff0080', marginBottom: '24px', maxWidth: '400px' }}>
            {this.state.error?.message || 'Erro desconhecido'}
          </p>
          <pre style={{
            background: '#0a1520',
            border: '1px solid #0d2030',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#7B61FF',
            maxWidth: '100%',
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            {this.state.error?.stack?.slice(0, 500)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px',
              background: '#00FFFF',
              color: '#050a0f',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            REINICIAR SISTEMA
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
