import { useState, useRef, useCallback } from 'react'

export function useElevenLabs() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef(null)

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setIsPlaying(false)
  }, [])

  const speak = useCallback(async (text, apiKey, voiceId = 'Rachel', settings = {}) => {
    if (!apiKey || !text?.trim()) return
    stop()
    setIsLoading(true)
    const clean = text.replace(/```[\s\S]*?```/g, 'bloco de codigo').replace(/`[^`]+`/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[#_*~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 600)
    if (!clean) { setIsLoading(false); return }
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({ text: clean, model_id: 'eleven_multilingual_v2', voice_settings: { stability: (settings.stability || 70) / 100, similarity_boost: (settings.clarity || 75) / 100, speed: settings.speed || 1.0 } })
      })
      if (!res.ok) throw new Error('ElevenLabs API error: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); setIsPlaying(false); audioRef.current = null }
      audio.onerror = () => { URL.revokeObjectURL(url); setIsPlaying(false); audioRef.current = null }
      audioRef.current = audio
      setIsLoading(false)
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      console.error('[ElevenLabs]', err)
      setIsLoading(false)
      throw err
    }
  }, [stop])

  const speakStreaming = useCallback(async (text, apiKey, voiceId = 'Rachel', settings = {}) => {
    if (!apiKey || !text?.trim()) return
    stop()
    setIsLoading(true)
    const clean = text.replace(/```[\s\S]*?```/g, 'bloco de codigo').replace(/`[^`]+`/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[#_*~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 600)
    if (!clean) { setIsLoading(false); return }
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3&output_format=mp3_44100_64`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({ text: clean, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: (settings.stability || 50) / 100, similarity_boost: (settings.clarity || 75) / 100, speed: settings.speed || 1.0 } })
      })
      if (!res.ok) throw new Error('ElevenLabs streaming error: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); setIsPlaying(false); audioRef.current = null }
      audioRef.current = audio
      setIsLoading(false)
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      console.error('[ElevenLabs Stream]', err)
      setIsLoading(false)
      throw err
    }
  }, [stop])

  return { speak, speakStreaming, stop, isPlaying, isLoading }
}
