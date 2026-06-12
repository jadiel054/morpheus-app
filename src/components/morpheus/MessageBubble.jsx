import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Volume2, VolumeX, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react'
import { formatTimestamp } from '../../lib/utils'

export function MessageBubble({ message, isSpeaking, onSpeak, onStop, onRegenerate, onFeedback }) {
  const isUser = message.role === 'user'
  const [showActions, setShowActions] = useState(false)
  const [playing, setPlaying] = useState(false)

  const handleSpeak = async () => {
    if (playing && onStop) {
      onStop()
      setPlaying(false)
      return
    }
    setPlaying(true)
    try {
      await onSpeak?.(message.content)
    } finally {
      setPlaying(false)
    }
  }

  return (
    <div className={'px-4 py-3 ' + (isUser ? '' : 'bg-dark-card/50')} onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="flex items-center gap-2 mb-1">
        <span className={'text-xs font-bold ' + (isUser ? 'text-electric-blue' : 'text-cyan')}>{isUser ? 'JADIEL' : 'MORPHEUS'}</span>
        {message.timestamp && <span className="text-xs opacity-30">{formatTimestamp(message.timestamp)}</span>}
        {message.model && <span className="model-badge">{message.model}</span>}
      </div>

      {!isUser && (playing || isSpeaking) && (
        <div className="flex items-center gap-2 mb-2">
          <div className="ldrs-waveform" />
          <span className="text-xs opacity-50">Reproduzindo...</span>
        </div>
      )}

      <div className="text-sm leading-relaxed opacity-90 prose prose-invert prose-sm max-w-none">
        {isUser ? <p>{message.content}</p> : <ReactMarkdown>{message.content || ''}</ReactMarkdown>}
      </div>
      {message.files?.length > 0 && <div className="flex gap-2 mt-2">{message.files.map((f, i) => <div key={i} className="text-xs opacity-50 border border-dark-border rounded px-2 py-1">{f.name || 'Arquivo'}</div>)}</div>}
      {!isUser && (showActions || playing) && (
        <div className="flex items-center gap-1 mt-2 opacity-40 hover:opacity-100 transition-opacity">
          <button onClick={handleSpeak} className={'p-1 ' + (playing || isSpeaking ? 'text-cyan' : '')} title={playing ? 'Parar' : 'Ouvir'}>
            {playing || isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <button onClick={() => onRegenerate?.()} className="p-1" title="Regenerar"><RefreshCw size={12} /></button>
          <button onClick={() => onFeedback?.('like')} className="p-1" title="Gostei"><ThumbsUp size={12} /></button>
          <button onClick={() => onFeedback?.('dislike')} className="p-1" title="Nao gostei"><ThumbsDown size={12} /></button>
        </div>
      )}
    </div>
  )
}
