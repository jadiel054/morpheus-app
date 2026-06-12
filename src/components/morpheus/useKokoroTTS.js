import { useState, useEffect, useRef, useCallback } from 'react'

const KOKORO_VOICES = [
  { id: 'af_nicole', name: 'Nicole', gender: 'female', accent: 'US', quality: 'high' },
  { id: 'af_bella', name: 'Bella', gender: 'female', accent: 'US', quality: 'high' },
  { id: 'af_sarah', name: 'Sarah', gender: 'female', accent: 'US', quality: 'high' },
  { id: 'af_sky', name: 'Sky', gender: 'female', accent: 'US', quality: 'high' },
  { id: 'am_adam', name: 'Adam', gender: 'male', accent: 'US', quality: 'high' },
  { id: 'am_michael', name: 'Michael', gender: 'male', accent: 'US', quality: 'high' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', accent: 'UK', quality: 'high' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'female', accent: 'UK', quality: 'high' },
  { id: 'bm_george', name: 'George', gender: 'male', accent: 'UK', quality: 'high' },
  { id: 'bm_lewis', name: 'Lewis', gender: 'male', accent: 'UK', quality: 'high' },
]

const SPEED_OPTIONS = [
  { value: 0.75, label: '0.75x' },
  { value: 0.9, label: '0.9x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.25, label: '1.25x' },
]

export function useKokoroTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [voices, setVoices] = useState(KOKORO_VOICES)
  const [currentVoice, setCurrentVoice] = useState('af_nicole')
  const [speed, setSpeed] = useState(1.0)
  const workerRef = useRef(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const { KokoroTTS } = await import('kokoro-js')
        const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.1-ONNX', { dtype: 'fp32' })
        if (cancelled) return
        workerRef.current = tts
        const availableVoices = await tts.list_voices()
        if (availableVoices?.length) {
          const merged = KOKORO_VOICES.map(kv => {
            const av = availableVoices.find(v => v === kv.id)
            return av ? kv : { ...kv, quality: 'unavailable' }
          })
          setVoices(merged)
        }
        setIsReady(true)
      } catch (err) {
        console.warn('[Kokoro] Init failed, falling back to Web Speech:', err.message)
        setIsReady(false)
      }
    }
    init()
    return () => { cancelled = true; if (workerRef.current?.destroy) workerRef.current.destroy() }
  }, [])

  const speak = useCallback(async (text, voiceId = currentVoice, spd = speed) => {
    if (!text?.trim() || !isReady || !workerRef.current) return false
    setIsLoading(true)
    const clean = text.replace(/```[\s\S]*?```/g, 'bloco de codigo').replace(/`[^`]+`/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[#_*~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 500)
    if (!clean) { setIsLoading(false); return false }
    try {
      const tts = workerRef.current
      const audio = await tts.generate(clean, { voice: voiceId, speed: spd })
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const buffer = ctx.createBuffer(1, audio.samples.length, audio.sample_rate)
      buffer.getChannelData(0).set(audio.samples)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      setIsLoading(false)
      setIsSpeaking(true)
      source.onended = () => setIsSpeaking(false)
      source.start()
      return true
    } catch (err) {
      console.error('[Kokoro] Speak error:', err)
      setIsLoading(false)
      return false
    }
  }, [isReady, currentVoice, speed])

  const previewVoice = useCallback(async (voiceId) => {
    const sample = 'Ola, eu sou a voz ' + (KOKORO_VOICES.find(v => v.id === voiceId)?.name || voiceId) + '. Testando o sistema de voz Kokoro.'
    return speak(sample, voiceId, 1.0)
  }, [speak])

  const stop = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  return { speak, stop, previewVoice, isSpeaking, isLoading, isReady, voices, currentVoice, setCurrentVoice, speed, setSpeed, speedOptions: SPEED_OPTIONS }
}
