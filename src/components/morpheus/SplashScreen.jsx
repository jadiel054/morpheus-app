import { useState, useEffect } from 'react'

const BOOT_SEQUENCE = [
  'Inicializando kernel NEBUCHADNEZZAR v1.0...',
  'Carregando modulos do sistema...',
  'Conectando ao Supabase...',
  'Inicializando Multi-LLM Router...',
  'Groq (llama-3.3-70b) — PRIMARIO — ONLINE',
  'OpenRouter — STANDBY',
  'DeepSeek — STANDBY',
  'KAIROS Engine — ATIVO',
  'Sistema pronto.',
]

export function SplashScreen({ onStart }) {
  const [lines, setLines] = useState([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < BOOT_SEQUENCE.length) { setLines(prev => [...prev, BOOT_SEQUENCE[i]]); i++ }
      else { clearInterval(interval); setDone(true) }
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="splash-container" onClick={() => done && onStart()}>
      <div className="ldrs-helix mb-8" />
      <h1 className="text-3xl font-bold text-cyan mb-2 tracking-widest">MORPHEUS</h1>
      <p className="text-xs opacity-40 mb-8">NEBUCHADNEZZAR v1.0</p>
      <div className="splash-sequence">
        {lines.map((line, i) => <div key={i} className="animate-fade-in-up">{'>'} {line}</div>)}
      </div>
      {done && <button className="mt-8 px-6 py-2 border border-cyan text-cyan rounded animate-pulse-cyan text-sm">INICIAR</button>}
    </div>
  )
}
