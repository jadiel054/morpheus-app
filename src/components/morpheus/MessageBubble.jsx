import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Volume2, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react'
import { formatTimestamp } from '../../lib/utils'

export function MessageBubble({ message, isSpeaking, onSpeak, onRegenerate, onFeedback }) {
  const isUser = message.role === 'user'
  const [showActions, setShowActions] = useState(false)
  return (
    <div className={`px-4 py-3 ${isUser ? '' : 'bg-dark-card/50'}`} onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold ${isUser ? 'text-electric-blue' : 'text-cyan'}`}>{isUser ? 'JADIEL' : 'MORPHEUS'}</span>
        {message.timestamp && <span className="text-xs opacity-30">{formatTimestamp(message.timestamp)}</span>}
        {message.model && <span className="model-badge">{message.model}</span>}
      </div>
      <div className="text-sm leading-relaxed opacity-90 prose prose-invert prose-sm max-w-none">
        {isUser ? <p>{message.content}</p> : <ReactMarkdown>{message.content || ''}</ReactMarkdown>}
      </div>
      {message.files?.length > 0 && <div className="flex gap-2 mt-2">{message.files.map((f, i) => <div key={i} className="text-xs opacity-50 border border-dark-border rounded px-2 py-1">{f.name || 'Arquivo'}</div>)}</div>}
      {!isUser && showActions && (
        <div className="flex items-center gap-1 mt-2 opacity-40 hover:opacity-100 transition-opacity">
          <button onClick={() => onSpeak?.(message.content)} className={`p-1 ${isSpeaking ? 'text-cyan' : ''}`}><Volume2 size={12} /></button>
          <button onClick={() => onRegenerate?.()} className="p-1"><RefreshCw size={12} /></button>
          <button onClick={() => onFeedback?.('like')} className="p-1"><ThumbsUp size={12} /></button>
          <button onClick={() => onFeedback?.('dislike')} className="p-1"><ThumbsDown size={12} /></button>
        </div>
      )}
    </div>
  )
}
