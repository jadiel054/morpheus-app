export interface TTSSettings {
  tts_engine?: 'auto' | 'elevenlabs' | 'kokoro' | 'disabled'
  elevenlabs_api_key?: string
  elevenlabs_voice_id?: string
  voice_stability?: number
  voice_clarity?: number
  voice_speed?: number
  kokoro_voice?: string
  language?: string
}

interface KokoroHook {
  speak: (text: string, voiceId: string, speed: number) => Promise<boolean>
}

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, 'bloco de codigo')
    .replace(/`[^`]+`/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[#_*~\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600)
}

async function speakElevenLabs(text: string, settings: TTSSettings): Promise<boolean> {
  if (!settings.elevenlabs_api_key) return false
  try {
    const res = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/' +
        (settings.elevenlabs_voice_id || 'Rachel') +
        '/stream',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': settings.elevenlabs_api_key,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: (settings.voice_stability || 70) / 100,
            similarity_boost: (settings.voice_clarity || 75) / 100,
            speed: settings.voice_speed || 1.0,
          },
        }),
      }
    )
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      return true
    }
  } catch {
    // fall through
  }
  return false
}

async function speakKokoro(
  text: string,
  settings: TTSSettings,
  kokoroHook?: KokoroHook
): Promise<boolean> {
  if (kokoroHook?.speak) {
    try {
      return await kokoroHook.speak(text, settings.kokoro_voice || 'af_nicole', settings.voice_speed || 1.0)
    } catch {
      // fall through
    }
  }
  return false
}

async function speakWebSpeech(text: string, settings: TTSSettings): Promise<boolean> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = settings.language || 'pt-BR'
    utt.rate = settings.voice_speed || 1.0
    utt.pitch = 0.9

    const voices = window.speechSynthesis.getVoices()
    const langVoice =
      voices.find((v) => v.lang === (settings.language || 'pt-BR') && v.localService) ||
      voices.find((v) => v.lang === (settings.language || 'pt-BR'))
    if (langVoice) utt.voice = langVoice

    utt.onend = () => resolve(true)
    utt.onerror = () => resolve(false)
    window.speechSynthesis.speak(utt)
  })
}

export async function speak(
  text: string,
  settings: TTSSettings,
  kokoroHook?: KokoroHook
): Promise<void> {
  const engine = settings.tts_engine || 'auto'
  const clean = cleanText(text)
  if (!clean) return

  // Hierarquia: ElevenLabs → Kokoro → WebSpeech
  if (engine === 'elevenlabs' || engine === 'auto') {
    const ok = await speakElevenLabs(clean, settings)
    if (ok) return
  }

  if (engine === 'kokoro' || engine === 'auto') {
    const ok = await speakKokoro(clean, settings, kokoroHook)
    if (ok) return
  }

  if (engine !== 'disabled') {
    await speakWebSpeech(clean, settings)
  }
}
