import { useState, useCallback } from 'react'

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speak = useCallback(async (text, options = {}) => {
    if (!text?.trim()) return
    const clean = text.replace(/```[\s\S]*?```/g, 'bloco de codigo').replace(/`[^`]+`/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[#_*~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 600)
    if (!clean) return

    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(false); return }
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(clean)
      utt.lang = options.lang || 'pt-BR'
      utt.rate = options.rate || 1.0
      utt.pitch = options.pitch || 0.9
      utt.volume = options.volume ?? 1.0

      const voices = window.speechSynthesis.getVoices()
      if (voices.length) {
        const langVoice = voices.find(v => v.lang === (options.lang || 'pt-BR') && v.localService)
        if (langVoice) utt.voice = langVoice
      }

      utt.onstart = () => setIsSpeaking(true)
      utt.onend = () => { setIsSpeaking(false); resolve(true) }
      utt.onerror = () => { setIsSpeaking(false); resolve(false) }

      window.speechSynthesis.speak(utt)
    })
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  const getVoices = useCallback(() => {
    if (!window.speechSynthesis) return []
    return window.speechSynthesis.getVoices().map(v => ({
      id: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService, default: v.default
    }))
  }, [])

  return { speak, stop, isSpeaking, getVoices }
}
