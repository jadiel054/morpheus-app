import { useRef, useState, useCallback } from 'react'

export const KOKORO_VOICES = [
  { id: 'af_nicole', name: 'Nicole', gender: 'F', lang: 'en-US', style: 'natural' },
  { id: 'af_sky', name: 'Sky', gender: 'F', lang: 'en-US', style: 'warm' },
  { id: 'af_heart', name: 'Heart', gender: 'F', lang: 'en-US', style: 'empathetic' },
  { id: 'am_eric', name: 'Eric', gender: 'M', lang: 'en-US', style: 'deep' },
  { id: 'am_michael', name: 'Michael', gender: 'M', lang: 'en-US', style: 'robotic' },
  { id: 'am_adam', name: 'Adam', gender: 'M', lang: 'en-US', style: 'cinematic' },
]

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const ttsRef = useRef(null)
  const audioRef = useRef(null)

  const loadModel = useCallback(async () => {
    if (ttsRef.current) return true
    setIsLoading(true)
    try { const { KokoroTTS } = await import('kokoro-js'); ttsRef.current = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', { dtype: 'q8' }); setIsReady(true); return true }
    catch (err) { console.error('[Kokoro]', err); return false }
    finally { setIsLoading(false) }
  }, [])

  const speak = useCallback(async (text, voice = 'af_nicole', speed = 1.0, onDone) => {
    stop(); const loaded = await loadModel(); if (!loaded || !ttsRef.current) return
    try { setIsSpeaking(true); const audio = await ttsRef.current.generate(text, { voice, speed }); audioRef.current = audio; audio.play(); audio.onended = () => { setIsSpeaking(false); onDone?.() } }
    catch (err) { console.error('[Kokoro]', err); setIsSpeaking(false) }
  }, [loadModel])

  const stop = useCallback(() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }; setIsSpeaking(false) }, [])

  return { isSpeaking, isLoading, isReady, speak, stop, loadModel, voices: KOKORO_VOICES }
}
