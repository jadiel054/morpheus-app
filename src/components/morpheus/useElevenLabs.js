import { useState, useRef, useCallback } from 'react'
const VM = { natural: 'Rachel', robotic: 'Adam', deep_robotic: 'Arnold', cinematic: 'Ethan' }

export function useElevenLabsSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef(null)

  const speak = useCallback(async (text, apiKey, style = 'natural', speed = 1.0, onDone) => {
    if (!apiKey) return; stop()
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + (VM[style] || 'Rachel') + '/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.7, similarity_boost: 0.75, speed } })
      })
      if (!res.ok) return
      const blob = await res.blob(); const url = URL.createObjectURL(blob)
      audioRef.current = new Audio(url); audioRef.current.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); onDone?.() }
      setIsSpeaking(true); await audioRef.current.play()
    } catch { setIsSpeaking(false) }
  }, [])

  const stopSpeaking = useCallback(() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }; setIsSpeaking(false) }, [])
  return { isSpeaking, speak, stopSpeaking }
}
