// public/kokoro-worker.js
// Roda em thread separado — nunca bloqueia a UI
let ttsInstance = null

self.onmessage = async (event) => {
  const { type, text, voice, speed, id } = event.data

  if (type === 'SPEAK') {
    try {
      if (!ttsInstance) {
        self.postMessage({ type: 'STATUS', id, status: 'loading' })
        const { KokoroTTS } = await import(
          'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm'
        )
        ttsInstance = await KokoroTTS.from_pretrained(
          'onnx-community/Kokoro-82M-ONNX',
          { dtype: 'q8', device: 'wasm' }
        )
        self.postMessage({ type: 'STATUS', id, status: 'ready' })
      }

      self.postMessage({ type: 'STATUS', id, status: 'generating' })
      const result = await ttsInstance.generate(text, { voice, speed })

      let audioBuffer
      if (result instanceof ArrayBuffer) {
        audioBuffer = result
      } else if (result?.arrayBuffer) {
        audioBuffer = await result.arrayBuffer()
      } else if (result instanceof Blob) {
        audioBuffer = await result.arrayBuffer()
      } else {
        throw new Error('Formato de audio desconhecido')
      }

      self.postMessage(
        { type: 'AUDIO', id, audioBuffer },
        [audioBuffer]
      )
    } catch (err) {
      self.postMessage({ type: 'ERROR', id, error: err.message })
    }
  }

  if (type === 'STOP') {
    self.postMessage({ type: 'STOPPED', id })
  }
}
