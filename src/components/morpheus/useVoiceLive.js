import { useState, useRef, useCallback } from 'react'

export function useVoiceLive({ onTranscript, language = 'pt-BR' } = {}) {
  const [isLive, setIsLive] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const recognitionRef = useRef(null)

  const start = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { console.warn('[VoiceLive] nao suportado'); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = language
    rec.onresult = (e) => { let f = '', i = ''; for (let j = e.resultIndex; j < e.results.length; j++) { if (e.results[j].isFinal) f += e.results[j][0].transcript; else i += e.results[j][0].transcript }; if (i) setIsUserSpeaking(true); if (f) { setIsUserSpeaking(false); onTranscript?.(f) } }
    rec.onerror = () => { setIsLive(false); setIsUserSpeaking(false) }
    rec.onend = () => { if (isLive) rec.start() }
    recognitionRef.current = rec; rec.start(); setIsLive(true)
  }, [language, onTranscript, isLive])

  const stop = useCallback(() => { recognitionRef.current?.stop(); setIsLive(false); setIsUserSpeaking(false) }, [])
  return { isLive, isUserSpeaking, start, stop }
}
