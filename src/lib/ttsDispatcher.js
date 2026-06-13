function cleanText(text) {
  return text.replace(/```[\s\S]*?```/g, 'bloco de codigo')
    .replace(/`[^`]+`/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[#_*~\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600)
}

async function tryElevenLabs(clean, settings) {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + (settings.elevenlabs_voice_id || 'Rachel') + '/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.elevenlabs_api_key },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: (settings.voice_stability || 70) / 100,
          similarity_boost: (settings.voice_clarity || 75) / 100,
          speed: settings.voice_speed || 1.0,
        }
      })
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      return true
    }
  } catch {}
  return false
}

export async function speak(text, settings, kokoroHook) {
  // Respeita flag voice_enabled do localStorage
  const currentSettings = (() => {
    try { return JSON.parse(localStorage.getItem('morpheus_settings') || '{}') }
    catch { return {} }
  })()
  if (currentSettings.voice_enabled === false) return

  const clean = cleanText(text)
  if (!clean) return

  if (settings.tts_engine === 'disabled') return

  // ElevenLabs — sem fallback
  if (settings.tts_engine === 'elevenlabs' && settings.elevenlabs_api_key) {
    const ok = await tryElevenLabs(clean, settings)
    if (ok) return
    console.warn('[TTS] ElevenLabs falhou. Sem fallback configurado.')
    return
  }

  // Kokoro — so fala se modelo foi baixado
  const kokoroInstalled = localStorage.getItem('kokoro-model-downloaded') === 'true'
  if (!kokoroInstalled) {
    console.info('[TTS] Kokoro nao instalado. Va em Configuracoes > Voz para baixar.')
    return
  }

  if (!kokoroHook) return

  try {
    await kokoroHook.speak(
      clean,
      settings.kokoro_voice || 'af_nicole',
      settings.voice_speed || 1.0
    )
  } catch (err) {
    console.warn('[TTS] Kokoro falhou:', err.message)
  }
}
