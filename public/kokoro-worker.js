// public/kokoro-worker.js
// Roda em thread separado — nunca bloqueia a UI
let ttsInstance = null

function clampSample(sample) {
  return Math.max(-1, Math.min(1, sample))
}

function encodeWavFromFloat32(samples, sampleRate = 24000) {
  const normalized = samples instanceof Float32Array
    ? samples
    : new Float32Array(samples)

  const bytesPerSample = 2
  const dataLength = normalized.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let index = 0; index < normalized.length; index += 1) {
    const sample = clampSample(normalized[index])
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += bytesPerSample
  }

  return buffer
}

async function extractAudioBuffer(result) {
  if (result instanceof ArrayBuffer) {
    return result
  }

  if (result instanceof Blob) {
    return await result.arrayBuffer()
  }

  if (result?.arrayBuffer && typeof result.arrayBuffer === 'function') {
    return await result.arrayBuffer()
  }

  const sampleRate = Number(
    result?.sampling_rate
    || result?.sample_rate
    || result?.sampleRate
    || 24000,
  )

  const rawSamples = result?.audio || result?.data
  if (
    rawSamples instanceof Float32Array
    || rawSamples instanceof Float64Array
    || Array.isArray(rawSamples)
  ) {
    return encodeWavFromFloat32(rawSamples, sampleRate)
  }

  if (ArrayBuffer.isView(rawSamples)) {
    return encodeWavFromFloat32(
      new Float32Array(rawSamples.buffer.slice(rawSamples.byteOffset, rawSamples.byteOffset + rawSamples.byteLength)),
      sampleRate,
    )
  }

  throw new Error('Formato de audio desconhecido')
}

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
      const audioBuffer = await extractAudioBuffer(result)

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
