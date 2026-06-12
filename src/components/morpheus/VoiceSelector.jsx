import { useState } from 'react'
import { Volume2, Play, Square, Check } from 'lucide-react'

export function VoiceSelector({ voices, currentVoice, onSelect, onPreview, isSpeaking, isLoading }) {
  const [previewingId, setPreviewingId] = useState(null)
  const [previewStatus, setPreviewStatus] = useState({})

  const handlePreview = async (voice) => {
    if (!onPreview) return
    setPreviewingId(voice.id)
    setPreviewStatus(prev => ({ ...prev, [voice.id]: 'playing' }))
    try {
      const ok = await onPreview(voice.id)
      setPreviewStatus(prev => ({ ...prev, [voice.id]: ok ? 'done' : 'failed' }))
    } catch {
      setPreviewStatus(prev => ({ ...prev, [voice.id]: 'failed' }))
    }
    setTimeout(() => {
      setPreviewingId(null)
      setPreviewStatus(prev => ({ ...prev, [voice.id]: null }))
    }, 2000)
  }

  const femaleVoices = voices.filter(v => v.gender === 'female' && v.quality !== 'unavailable')
  const maleVoices = voices.filter(v => v.gender === 'male' && v.quality !== 'unavailable')
  const unavailable = voices.filter(v => v.quality === 'unavailable')

  return (
    <div className="voice-selector">
      <style>{`
        .voice-selector { display: flex; flex-direction: column; gap: 16px; }
        .voice-group-title { font-size: 0.65rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
        .voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
        .voice-card { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--dark-border); border-radius: 6px; cursor: pointer; transition: all 0.15s; background: var(--dark-card); }
        .voice-card:hover { border-color: rgba(0,255,255,0.4); }
        .voice-card--active { border-color: var(--cyan); background: rgba(0,255,255,0.06); }
        .voice-card--unavailable { opacity: 0.3; cursor: not-allowed; }
        .voice-info { display: flex; flex-direction: column; gap: 1px; }
        .voice-name { font-size: 0.75rem; color: var(--cyan); }
        .voice-accent { font-size: 0.6rem; opacity: 0.4; }
        .voice-preview-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--dark-border); background: none; color: var(--cyan); cursor: pointer; transition: all 0.15s; }
        .voice-preview-btn:hover { border-color: var(--cyan); background: rgba(0,255,255,0.1); }
        .voice-preview-btn--playing { border-color: var(--cyan); background: rgba(0,255,255,0.2); }
        .voice-preview-btn--done { border-color: #00ff66; color: #00ff66; }
      `}</style>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs opacity-50">
          <div className="ldrs-waveform" />
          Carregando modelo Kokoro...
        </div>
      )}

      {femaleVoices.length > 0 && (
        <div>
          <div className="voice-group-title">Vozes Femininas</div>
          <div className="voice-grid">
            {femaleVoices.map(voice => (
              <div
                key={voice.id}
                className={'voice-card' + (currentVoice === voice.id ? ' voice-card--active' : '') + (voice.quality === 'unavailable' ? ' voice-card--unavailable' : '')}
                onClick={() => voice.quality !== 'unavailable' && onSelect?.(voice.id)}
              >
                <div className="voice-info">
                  <span className="voice-name">{voice.name}</span>
                  <span className="voice-accent">{voice.accent} {voice.quality === 'high' ? '' : '(' + voice.quality + ')'}</span>
                </div>
                <button
                  className={'voice-preview-btn' + (previewingId === voice.id ? ' voice-preview-btn--playing' : '') + (previewStatus[voice.id] === 'done' ? ' voice-preview-btn--done' : '')}
                  onClick={(e) => { e.stopPropagation(); handlePreview(voice) }}
                  disabled={previewingId === voice.id}
                  title={previewingId === voice.id ? 'Parar' : 'Preview'}
                >
                  {previewingId === voice.id ? (
                    <div className="ldrs-waveform" style={{ width: 14, height: 14 }} />
                  ) : previewStatus[voice.id] === 'done' ? (
                    <Check size={12} />
                  ) : (
                    <Play size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {maleVoices.length > 0 && (
        <div>
          <div className="voice-group-title">Vozes Masculinas</div>
          <div className="voice-grid">
            {maleVoices.map(voice => (
              <div
                key={voice.id}
                className={'voice-card' + (currentVoice === voice.id ? ' voice-card--active' : '')}
                onClick={() => onSelect?.(voice.id)}
              >
                <div className="voice-info">
                  <span className="voice-name">{voice.name}</span>
                  <span className="voice-accent">{voice.accent}</span>
                </div>
                <button
                  className={'voice-preview-btn' + (previewingId === voice.id ? ' voice-preview-btn--playing' : '') + (previewStatus[voice.id] === 'done' ? ' voice-preview-btn--done' : '')}
                  onClick={(e) => { e.stopPropagation(); handlePreview(voice) }}
                  disabled={previewingId === voice.id}
                  title={previewingId === voice.id ? 'Parar' : 'Preview'}
                >
                  {previewingId === voice.id ? (
                    <div className="ldrs-waveform" style={{ width: 14, height: 14 }} />
                  ) : previewStatus[voice.id] === 'done' ? (
                    <Check size={12} />
                  ) : (
                    <Play size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unavailable.length > 0 && (
        <div>
          <div className="voice-group-title">Indisponiveis</div>
          <div className="voice-grid">
            {unavailable.map(voice => (
              <div key={voice.id} className="voice-card voice-card--unavailable">
                <div className="voice-info">
                  <span className="voice-name">{voice.name}</span>
                  <span className="voice-accent">Nao disponivel</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
