import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from 'react'
import { useAuth } from '../lib/authContext'
import { useKokoroTTS } from '../components/morpheus/useKokoroTTS'
import { useElevenLabs } from '../components/morpheus/useElevenLabs'
import { useVoiceLive } from '../components/morpheus/useVoiceLive'

export default function Morpheus() {
  // Hook 1
  const { user } = useAuth()
  // Hook 2
  const [showSplash, setShowSplash] = useState(true)
  // Hook 3
  const kokoro = useKokoroTTS()
  // Hook 4
  const elevenlabs = useElevenLabs()
  // Hook 5
  const voiceLive = useVoiceLive({ onTranscript: () => {} })

  if (!user) return <div style={{color:'#00FFFF',background:'#050a0f',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>LOGIN NECESSARIO</div>
  if (showSplash) return <div style={{color:'#00FFFF',background:'#050a0f',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}} onClick={() => setShowSplash(false)}>CLIQUE PARA INICIAR</div>

  return (
    <div style={{color:'#00FFFF',background:'#050a0f',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>
      MORPHEUS FUNCIONANDO OK
    </div>
  )
}
