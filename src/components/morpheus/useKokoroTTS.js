import { useRef, useState, useCallback } from 'react'

// Kokoro é carregado via CDN em runtime — NUNCA bundlado pelo Vite
// Isso evita OOM no esbuild e mantém o bundle leve
const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.min.js'

export const KOKORO_VOICES = [
  { id: 'af_nicole',  name: 'Nicole',  gender: 'F', style: 'natural' },
  { id: 'af_sky',     name: 'Sky',     gender: 'F', style: 'warm' },
  { id: 'af_heart',   name: 'Heart',   gender: 'F', style: 'empathetic' },
  { id: 'af_sarah',   name: 'Sarah',   gender: 'F', style: 'professional' },
  { id: 'am_eric',    name: 'Eric',    gender: 'M', style: 'deep' },
  { id: 'am_michael', name: 'Michael', gender: 'M', style: 'robotic' },
  { id: 'am_adam',    name: 'Adam',    gender: 'M', style: 'cinematic' },
]

// Cache global do módulo carregado (persiste entre renders)
let kokoroModuleCache = null
let kokoroInstanceCache = null

async function loadKokoroFromCDN() {
  // Já carregado anteriormente
  if (kokoroInstanceCache) return kokoroInstanceCache

  // Carrega o script via CDN dinamicamente se ainda não estiver na página
  if (!kokoroModuleCache) {
    await new Promise((resolve, reject) => {
      // Verifica se já foi injetado
      if (document.querySelector(`script[data-kokoro]`)) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = KOKORO_CDN
      script.setAttribute('data-kokoro', 'true')
      script.onload = resolve
      script.onerror = () => reject(new Error('Falha ao carregar Kokoro via CDN'))
      document.head.appendChild(script)
    })
    kokoroModuleCache = window.KokoroTTS || window.kokoro
  }

  if (!kokoroModuleCache) {
    throw new Error('Kokoro não encontrado após carregamento do CDN')
  }

  // Instancia o modelo ONNX (q8 = quantizado, mais leve)
  const KokoroTTS = kokoroModuleCache.KokoroTTS || kokoroModuleCache
  kokoroInstanceCache = await KokoroTTS.from_pretrained(
    'onnx-community/Kokoro-82M-ONNX',
    { dtype: 'q8', device: 'wasm' }
  )
  return kokoroInstanceCache
}

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isReady,    setIsReady]    = useState(false)
  const [error,      setError]      = useState(null)
  const audioRef = useRef(null)
  const currentVoiceRef = useRef('af_nicole')

  const speak = useCallback(async (
    text,
    voice = 'af_nicole',
    speed = 1.0,
    onDone
  ) => {
    stop()
    setError(null)
    currentVoiceRef.current = voice

    try {
      setIsLoading(true)
      const tts = await loadKokoroFromCDN()
      setIsReady(true)
      setIsLoading(false)
      setIsSpeaking(true)

      const audio = await tts.generate(text, { voice, speed })

      // Kokoro retorna AudioBuffer ou Blob dependendo da versão
      let audioUrl
      if (audio instanceof Blob) {
        audioUrl = URL.createObjectURL(audio)
      } else if (audio?.blob) {
        audioUrl = URL.createObjectURL(audio.blob)
      } else {
        // Fallback: tenta converter ArrayBuffer
        const blob = new Blob([audio], { type: 'audio/wav' })
        audioUrl = URL.createObjectURL(blob)
      }

      const audioEl = new Audio(audioUrl)
      audioRef.current = audioEl

      audioEl.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
        onDone?.()
      }

      audioEl.onerror = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
        setError('Erro ao reproduzir áudio Kokoro')
      }

      await audioEl.play()
    } catch (err) {
      console.error('[Kokoro] Erro:', err)
      setError(err.message)
      setIsLoading(false)
      setIsSpeaking(false)
      // Não relança — deixa o ttsDispatcher fazer fallback para WebSpeech
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
    // Pré-carrega o modelo em background (chamado na splash screen)
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
    currentVoice: currentVoiceRef.current,
  }
}
