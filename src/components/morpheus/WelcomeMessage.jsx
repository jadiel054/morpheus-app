export function WelcomeMessage({ userName, onQuickCommand }) {
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5  && hour < 12) return 'Bom dia'
    if (hour >= 12 && hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const getMotivationalLine = () => {
    const lines = [
      'O que vamos codar hoje?',
      'Pronto para construir algo incrivel?',
      'Qual sistema autonomo criamos hoje?',
      'Sua proxima ideia comeca agora.',
      'O que o MORPHEUS pode orquestrar por voce hoje?',
      'Vamos dominar mais um projeto?',
      'Sistemas online. Aguardando suas ordens.',
    ]
    return lines[new Date().getDate() % lines.length]
  }

  const quickCommands = [
    { icon: '\u2600\uFE0F', label: 'Clima',     cmd: 'Como esta o clima em Xanxere?' },
    { icon: '\uD83E\uDDEE', label: 'Calcular',  cmd: 'Calcule 245 * 18' },
    { icon: '\uD83D\uDCBB', label: 'Codigo',    cmd: 'Me ajuda com um codigo' },
    { icon: '\uD83D\uDD0D', label: 'Pesquisar', cmd: 'Pesquise na web sobre' },
    { icon: '\uD83D\uDCCA', label: 'Analisar',  cmd: 'Analise meu repositorio' },
    { icon: '\uD83D\uDE80', label: 'Deploy',    cmd: 'Verifique meus deploys no Vercel' },
  ]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      padding: '24px 20px',
      gap: '24px',
      minHeight: '60vh',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '13px',
          color: 'rgba(0,255,255,0.5)',
          letterSpacing: '3px',
          fontFamily: 'monospace',
          marginBottom: '8px',
        }}>
          {getGreeting()},
        </div>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '900',
          color: '#00FFFF',
          fontFamily: "'Orbitron', monospace",
          letterSpacing: '2px',
          marginBottom: '8px',
          textShadow: '0 0 20px rgba(0,255,255,0.4)',
        }}>
          {userName || 'Jadiel'}
        </h2>
        <p style={{
          fontSize: '14px',
          color: 'rgba(0,255,255,0.6)',
          fontFamily: 'monospace',
          letterSpacing: '1px',
        }}>
          {getMotivationalLine()}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
        width: '100%',
        maxWidth: '420px',
      }}>
        {quickCommands.map(({ icon, label, cmd }) => (
          <button
            key={label}
            onClick={() => onQuickCommand(cmd)}
            style={{
              background: 'rgba(0,255,255,0.05)',
              border: '1px solid rgba(0,255,255,0.15)',
              borderRadius: '10px',
              padding: '14px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: '#00FFFF',
              fontFamily: 'monospace',
            }}
            onTouchStart={e => e.currentTarget.style.background = 'rgba(0,255,255,0.12)'}
            onTouchEnd={e => e.currentTarget.style.background = 'rgba(0,255,255,0.05)'}
          >
            <span style={{ fontSize: '22px' }}>{icon}</span>
            <span style={{ fontSize: '11px', letterSpacing: '1px', opacity: 0.8 }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {[
          { label: 'GROQ', status: 'ONLINE', color: '#00FFFF' },
          { label: 'KAIROS', status: 'ATIVO', color: '#7B61FF' },
          { label: 'SUPABASE', status: 'ONLINE', color: '#00FFFF' },
        ].map(({ label, status, color }) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            fontFamily: 'monospace',
            color: 'rgba(0,255,255,0.4)',
            letterSpacing: '1px',
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: color,
              boxShadow: `0 0 6px ${color}`,
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}/>
            {label}: <span style={{ color }}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
