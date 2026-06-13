import { useState, useEffect } from 'react'

const KOKORO_MODEL_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/onnx/model_quantized.onnx'
const CACHE_NAME = 'morpheus-kokoro-v1'
const CACHE_KEY = 'kokoro-model-downloaded'

export const KOKORO_VOICES = [
  { id: 'af_nicole',  name: 'Nicole',  gender: 'F', style: 'Natural', lang: 'EN' },
  { id: 'af_sky',     name: 'Sky',     gender: 'F', style: 'Calorosa', lang: 'EN' },
  { id: 'af_heart',   name: 'Heart',   gender: 'F', style: 'Empatica', lang: 'EN' },
  { id: 'af_sarah',   name: 'Sarah',   gender: 'F', style: 'Profissional', lang: 'EN' },
  { id: 'am_eric',    name: 'Eric',    gender: 'M', style: 'Grave', lang: 'EN' },
  { id: 'am_michael', name: 'Michael', gender: 'M', style: 'Robotico', lang: 'EN' },
  { id: 'am_adam',    name: 'Adam',    gender: 'M', style: 'Cinematico', lang: 'EN' },
]

export function KokoroDownloadManager({ onDownloadComplete, onSkip }) {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [downloaded, setDownloaded] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('af_nicole')

  useEffect(() => {
    const isDone = localStorage.getItem(CACHE_KEY) === 'true'
    if (isDone) {
      setDownloaded(true)
      onDownloadComplete?.()
    }
  }, [])

  const handleDownload = async () => {
    setStatus('downloading')
    setProgress(0)
    try {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(KOKORO_MODEL_URL)
      if (cached) {
        setProgress(100)
        setStatus('done')
        setDownloaded(true)
        localStorage.setItem(CACHE_KEY, 'true')
        onDownloadComplete?.()
        return
      }

      const response = await fetch(KOKORO_MODEL_URL)
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength) : 80 * 1024 * 1024
      const reader = response.body.getReader()
      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        setProgress(Math.round((received / total) * 100))
      }

      const blob = new Blob(chunks)
      const cacheResponse = new Response(blob, {
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      await cache.put(KOKORO_MODEL_URL, cacheResponse)
      localStorage.setItem(CACHE_KEY, 'true')
      setStatus('done')
      setDownloaded(true)
      onDownloadComplete?.()
    } catch (err) {
      console.error('[Kokoro Download]', err)
      setStatus('error')
    }
  }

  const handleClearCache = async () => {
    await caches.delete(CACHE_NAME)
    localStorage.removeItem(CACHE_KEY)
    setDownloaded(false)
    setStatus('idle')
    setProgress(0)
  }

  if (downloaded) {
    return (
      <div style={{
        background: 'rgba(0,255,255,0.05)',
        border: '1px solid rgba(0,255,255,0.2)',
        borderRadius: '10px', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '10px',
        fontFamily: 'monospace', fontSize: '12px', color: '#00FFFF',
      }}>
        <span>Kokoro instalado e pronto</span>
        <span style={{ flex: 1 }} />
        <button onClick={handleClearCache} style={{
          background: 'transparent', border: '1px solid rgba(255,0,128,0.3)',
          borderRadius: '6px', padding: '4px 10px',
          color: 'rgba(255,0,128,0.7)', fontFamily: 'monospace',
          fontSize: '11px', cursor: 'pointer',
        }}>
          Remover
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: '#0a1520',
      border: '1px solid #0d2030',
      borderRadius: '12px', padding: '20px',
      fontFamily: 'monospace',
    }}>
      <h3 style={{ color: '#00FFFF', fontSize: '14px', letterSpacing: '2px',
        marginBottom: '8px' }}>
        VOZES KOKORO — DOWNLOAD OFFLINE
      </h3>
      <p style={{ color: 'rgba(0,255,255,0.5)', fontSize: '11px',
        marginBottom: '16px', lineHeight: 1.5 }}>
        Baixe o modelo de voz uma vez (~80MB) e use offline para sempre.
        Sem downloads durante o uso — zero travamento.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: 'rgba(0,255,255,0.6)', fontSize: '11px',
          letterSpacing: '1px', marginBottom: '8px' }}>
          VOZ PADRAO:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          {KOKORO_VOICES.map(v => (
            <button key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              style={{
                padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '11px', textAlign: 'left',
                background: selectedVoice === v.id
                  ? 'rgba(0,255,255,0.15)' : 'transparent',
                border: selectedVoice === v.id
                  ? '1px solid #00FFFF' : '1px solid rgba(0,255,255,0.1)',
                color: selectedVoice === v.id ? '#00FFFF' : 'rgba(0,255,255,0.5)',
              }}>
              {v.gender} {v.name}
              <span style={{ display: 'block', fontSize: '10px', opacity: 0.6 }}>
                {v.style}
              </span>
            </button>
          ))}
        </div>
      </div>

      {status === 'downloading' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: '11px', color: 'rgba(0,255,255,0.6)', marginBottom: '6px' }}>
            <span>Baixando modelo Kokoro...</span>
            <span>{progress}%</span>
          </div>
          <div style={{
            background: 'rgba(0,255,255,0.1)', borderRadius: '4px',
            height: '6px', overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #00FFFF, #7B61FF)',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 8px rgba(0,255,255,0.5)',
            }}/>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ color: '#ff0080', fontSize: '11px', marginBottom: '12px' }}>
          Erro no download. Verifique sua conexao e tente novamente.
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleDownload}
          disabled={status === 'downloading'}
          style={{
            flex: 1, padding: '12px',
            background: status === 'downloading'
              ? 'rgba(0,255,255,0.3)' : '#00FFFF',
            color: '#050a0f', border: 'none', borderRadius: '8px',
            fontFamily: 'monospace', fontWeight: '700',
            fontSize: '12px', letterSpacing: '1px',
            cursor: status === 'downloading' ? 'not-allowed' : 'pointer',
          }}>
          {status === 'downloading' ? `${progress}%` : 'BAIXAR KOKORO'}
        </button>
        <button onClick={onSkip} style={{
          padding: '12px 16px', background: 'transparent',
          border: '1px solid rgba(0,255,255,0.2)', borderRadius: '8px',
          color: 'rgba(0,255,255,0.5)', fontFamily: 'monospace',
          fontSize: '12px', cursor: 'pointer',
        }}>
          Usar voz nativa
        </button>
      </div>
      <p style={{ color: 'rgba(0,255,255,0.3)', fontSize: '10px',
        marginTop: '10px', textAlign: 'center' }}>
        Armazenado localmente no seu dispositivo. Pode ser removido a qualquer momento.
      </p>
    </div>
  )
}
