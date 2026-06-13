import { useRef, useState, useCallback } from 'react'

const CACHE_KEY = 'kokoro-model-downloaded'
const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm'

let ttsInstance = null

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isReady,    setIsReady]    = useState(
    localStorage.getItem(CACHE_KEY) === 'true'
  )
  const audioRef = useRef(null)

  const loadTTS = useCallback(async () => {
    if (ttsInstance) return ttsInstance

    if (localStorage.getItem(CACHE_KEY) !== 'true') {
      throw new Error('Modelo nao baixado. Va em Configuracoes > Voz para baixar.')
    }

    setIsLoading(true)
    try {
      const mod = await import(/* @vite-ignore */ KOKORO_CDN)
      const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS
      if (!KokoroTTS) throw new Error('KokoroTTS nao encontrado')

      ttsInstance = await KokoroTTS.from_pretrained(
        'onnx-community/Kokoro-82M-ONNX',
        { dtype: 'q8', device: 'wasm' }
      )
      setIsReady(true)
      return ttsInstance
    } finally {
      setIsLoading(false)
    }
  }, [])

  const speak = useCallback(async (text, voice = 'af_nicole', speed = 1.0, onDone) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (localStorage.getItem(CACHE_KEY) !== 'true') {
      throw new Error('Kokoro nao instalado')
    }

    try {
      setIsSpeaking(true)
      const tts = await loadTTS()
      const result = await tts.generate(text, { voice, speed })

      let audioUrl
      if (result instanceof Blob) {
        audioUrl = URL.createObjectURL(result)
      } else if (result?.blob) {
        audioUrl = URL.createObjectURL(result.blob)
      } else {
        const blob = new Blob([result], { type: 'audio/wav' })
        audioUrl = URL.createObjectURL(blob)
      }

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
        onDone?.()
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
        throw new Error('Erro ao reproduzir')
      }
      await audio.play()
    } catch (err) {
      setIsSpeaking(false)
      throw err
    }
  }, [loadTTS])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  return { isSpeaking, isLoading, isReady, speak, stop }
}
