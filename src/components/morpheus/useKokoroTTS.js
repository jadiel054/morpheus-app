import { useRef, useState, useCallback } from 'react'

const CACHE_KEY = 'kokoro-model-downloaded'

let workerInstance = null
let messageIdCounter = 0
const pendingCallbacks = new Map()

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker('/kokoro-worker.js')
    workerInstance.onmessage = (event) => {
      const { type, id, audioBuffer, error, status } = event.data
      if (type === 'AUDIO') {
        const cb = pendingCallbacks.get(id)
        if (cb) {
          pendingCallbacks.delete(id)
          cb.resolve(audioBuffer)
        }
      }
      if (type === 'ERROR') {
        const cb = pendingCallbacks.get(id)
        if (cb) {
          pendingCallbacks.delete(id)
          cb.reject(new Error(error))
        }
      }
      if (type === 'STATUS') {
        console.log(`[Kokoro Worker] ${status}`)
      }
    }
    workerInstance.onerror = (err) => {
      console.error('[Kokoro Worker] Erro:', err)
    }
  }
  return workerInstance
}

export const KOKORO_VOICES = [
  { id: 'af_nicole',  name: 'Nicole',  gender: 'F', style: 'Natural' },
  { id: 'af_sky',     name: 'Sky',     gender: 'F', style: 'Calorosa' },
  { id: 'af_heart',   name: 'Heart',   gender: 'F', style: 'Empatica' },
  { id: 'af_sarah',   name: 'Sarah',   gender: 'F', style: 'Profissional' },
  { id: 'am_eric',    name: 'Eric',    gender: 'M', style: 'Grave' },
  { id: 'am_michael', name: 'Michael', gender: 'M', style: 'Robotico' },
  { id: 'am_adam',    name: 'Adam',    gender: 'M', style: 'Cinematico' },
]

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isReady,    setIsReady]    = useState(
    () => localStorage.getItem(CACHE_KEY) === 'true'
  )
  const audioRef    = useRef(null)
  const currentIdRef = useRef(null)

  const speak = useCallback(async (text, voice = 'af_nicole', speed = 1.0, onDone) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    if (localStorage.getItem(CACHE_KEY) !== 'true') {
      throw new Error('Kokoro nao instalado. Baixe em Configuracoes > Voz.')
    }

    const id = ++messageIdCounter
    currentIdRef.current = id
    setIsLoading(true)

    try {
      const audioBuffer = await new Promise((resolve, reject) => {
        pendingCallbacks.set(id, { resolve, reject })
        getWorker().postMessage({ type: 'SPEAK', text, voice, speed, id })
      })

      if (currentIdRef.current !== id) return

      setIsLoading(false)
      setIsSpeaking(true)

      const blob = new Blob([audioBuffer], { type: 'audio/wav' })
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
        onDone?.()
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch (err) {
      setIsLoading(false)
      setIsSpeaking(false)
      throw err
    }
  }, [])

  const stop = useCallback(() => {
    currentIdRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setIsSpeaking(false)
    setIsLoading(false)
  }, [])

  return { isSpeaking, isLoading, isReady, speak, stop, voices: KOKORO_VOICES }
}
