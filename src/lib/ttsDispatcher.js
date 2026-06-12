export async function speak(text, settings, kokoroHook) {
  const engine = settings.tts_engine || 'auto'
  const clean = text.replace(/```[\s\S]*?```/g, 'bloco de codigo').replace(/`[^`]+`/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[#_*~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 600)
  if (!clean) return
  if (engine === 'elevenlabs' && settings.elevenlabs_api_key) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + (settings.elevenlabs_voice_id || 'Rachel') + '/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.elevenlabs_api_key },
        body: JSON.stringify({ text: clean, model_id: 'eleven_multilingual_v2', voice_settings: { stability: (settings.voice_stability || 70) / 100, similarity_boost: (settings.voice_clarity || 75) / 100, speed: settings.voice_speed || 1.0 } })
      })
      if (res.ok) { const blob = await res.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); return }
    } catch {}
  }
  if ((engine === 'kokoro' || engine === 'auto') && kokoroHook?.speak) {
    try { await kokoroHook.speak(clean, settings.kokoro_voice || 'af_nicole', settings.voice_speed || 1.0); return } catch {}
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(clean); utt.lang = settings.language || 'pt-BR'; utt.rate = settings.voice_speed || 1.0; utt.pitch = 0.9
    const voices = window.speechSynthesis.getVoices(); const ptVoice = voices.find(v => v.lang === 'pt-BR' && v.localService) || voices.find(v => v.lang === 'pt-BR')
    if (ptVoice) utt.voice = ptVoice; window.speechSynthesis.speak(utt)
  }
}
