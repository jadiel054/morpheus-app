import { useRef, useState, useCallback } from 'react'

// Kokoro via dynamic ESM import do CDN — compatível com browser moderno
const KOKORO_CDN_ESM = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm'

export const KOKORO_VOICES = [
  { id: 'af_nicole',  name: 'Nicole',  gender: 'F', style: 'natural' },
  { id: 'af_sky',     name: 'Sky',     gender: 'F', style: 'warm' },
  { id: 'af_heart',   name: 'Heart',   gender: 'F', style: 'empathetic' },
  { id: 'af_sarah',   name: 'Sarah',   gender: 'F', style: 'professional' },
  { id: 'am_eric',    name: 'Eric',    gender: 'M', style: 'deep' },
  { id: 'am_michael', name: 'Michael', gender: 'M', style: 'robotic' },
  { id: 'am_adam',    name: 'Adam',    gender: 'M', style: 'cinematic' },
]

let kokoroInstanceCache = null

async function loadKokoroFromCDN() {
  if (kokoroInstanceCache) return kokoroInstanceCache

  try {
    const kokoroModule = await import(/* @vite-ignore */ KOKORO_CDN_ESM)
    const KokoroTTS = kokoroModule.KokoroTTS || kokoroModule.default?.KokoroTTS
    if (!KokoroTTS) throw new Error('KokoroTTS nao encontrado no modulo CDN')

    kokoroInstanceCache = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-ONNX',
      { dtype: 'q8', device: 'wasm' }
    )
    return kokoroInstanceCache
  } catch (err) {
    console.error('[Kokoro] Falha ao carregar:', err)
    throw err
  }
}

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isReady,    setIsReady]    = useState(false)
  const [error,      setError]      = useState(null)
  const audioRef = useRef(null)

  const speak = useCallback(async (text, voice = 'af_nicole', speed = 1.0) => {
    stop()
    setError(null)

    try {
      setIsLoading(true)
      const tts = await loadKokoroFromCDN()
      setIsReady(true)
      setIsLoading(false)
      setIsSpeaking(true)

      const audio = await tts.generate(text, { voice, speed })

      let audioUrl
      if (audio instanceof Blob) {
        audioUrl = URL.createObjectURL(audio)
      } else if (audio?.blob) {
        audioUrl = URL.createObjectURL(audio.blob)
      } else {
        const blob = new Blob([audio], { type: 'audio/wav' })
        audioUrl = URL.createObjectURL(blob)
      }

      const audioEl = new Audio(audioUrl)
      audioRef.current = audioEl

      return new Promise((resolve, reject) => {
        audioEl.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
          resolve()
        }
        audioEl.onerror = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
          setError('Erro ao reproduzir audio Kokoro')
          reject(new Error('Audio playback failed'))
        }
        audioEl.play().catch(reject)
      })
    } catch (err) {
      console.error('[Kokoro] Erro:', err)
      setError(err.message)
      setIsLoading(false)
      setIsSpeaking(false)
      throw err
    }
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const preload = useCallback(async () => {
    if (isReady || isLoading) return
    try {
      setIsLoading(true)
      await loadKokoroFromCDN()
      setIsReady(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [isReady, isLoading])

  return {
    isSpeaking,
    isLoading,
    isReady,
    error,
    speak,
    stop,
    preload,
    voices: KOKORO_VOICES,
  }
}
