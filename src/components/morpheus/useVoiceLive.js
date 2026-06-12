import { useState, useRef, useCallback, useEffect } from 'react'

export function useVoiceLive({ language = 'pt-BR', onTranscript, onInterim } = {}) {
  const [isLive, setIsLive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const lastResultRef = useRef('')

  const SILENCE_TIMEOUT = 2000

  useEffect(() => {
    try {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech Recognition nao disponivel neste navegador.')
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = language

    rec.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }
      if (finalTranscript) {
        lastResultRef.current = finalTranscript
        setTranscript(prev => prev + ' ' + finalTranscript)
        setInterim('')
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          const full = (lastResultRef.current || '').trim()
          if (full && onTranscript) {
            onTranscript(full)
            setTranscript('')
            lastResultRef.current = ''
          }
        }, SILENCE_TIMEOUT)
      }
      if (interimTranscript) {
        setInterim(interimTranscript)
        if (onInterim) onInterim(interimTranscript)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          const full = (lastResultRef.current || '').trim()
          if (full && onTranscript) {
            onTranscript(full)
            setTranscript('')
            lastResultRef.current = ''
          }
        }, SILENCE_TIMEOUT)
      }
    }

    rec.onerror = (event) => {
      console.error('[VoiceLive]', event.error)
      if (event.error === 'not-allowed') setError('Microfone bloqueado. Permita o acesso nas configuracoes.')
      if (event.error === 'no-speech') { /* silencio — normal */ }
    }

    rec.onend = () => {
      setIsListening(false)
      if (isLive) {
        setTimeout(() => {
          try { rec.start(); setIsListening(true) } catch {}
        }, 300)
      }
    }

    recognitionRef.current = rec
    return () => {
      try { rec.stop() } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
    } catch (err) {
      console.error('[VoiceLive] Init error:', err)
      setError('Erro ao inicializar reconhecimento de voz: ' + (err.message || 'desconhecido'))
    }
  }, [language])

  const start = useCallback(() => {
    if (!recognitionRef.current) return
    setError(null)
    setTranscript('')
    setInterim('')
    lastResultRef.current = ''
    setIsLive(true)
    try { recognitionRef.current.start(); setIsListening(true) } catch (err) { setError('Erro ao iniciar microfone: ' + err.message) }
  }, [])

  const stop = useCallback(() => {
    setIsLive(false)
    try { recognitionRef.current.stop() } catch {}
    setIsListening(false)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    const final = (transcript + ' ' + interim).trim()
    if (final && onTranscript) onTranscript(final)
    setTranscript('')
    setInterim('')
    lastResultRef.current = ''
  }, [transcript, interim, onTranscript])

  const toggle = useCallback(() => {
    if (isLive) stop(); else start()
  }, [isLive, start, stop])

  return { isLive, isListening, transcript, interim, error, start, stop, toggle }
}
