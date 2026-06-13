import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { timeAgo } from '../../lib/utils'

export function MessageBubble({ message, isSpeaking, onSpeak, onStop, onRegenerate }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  const handleSpeak = () => {
    if (isSpeaking && onStop) {
      onStop()
      return
    }
    onSpeak?.(message.content)
  }

  return (
    <div style={{
      padding: '12px 16px',
      background: isUser ? 'transparent' : 'rgba(0,255,255,0.02)',
      borderBottom: '1px solid rgba(0,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', fontFamily: 'monospace',
          color: isUser ? '#7B61FF' : '#00FFFF',
          letterSpacing: '1px',
        }}>
          {isUser ? 'JADIEL' : 'MORPHEUS'}
        </span>
        {message.timestamp && (
          <span style={{ fontSize: '10px', color: 'rgba(0,255,255,0.3)', fontFamily: 'monospace' }}>
            {timeAgo(message.timestamp)}
          </span>
        )}
      </div>

      {!isUser && isSpeaking && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div className="ldrs-waveform" />
          <span style={{ fontSize: '11px', color: 'rgba(0,255,255,0.5)', fontFamily: 'monospace' }}>
            Reproduzindo...
          </span>
        </div>
      )}

      <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(0,255,255,0.85)' }}>
        {isUser ? <p>{message.content}</p> : <ReactMarkdown>{message.content || ''}</ReactMarkdown>}
      </div>

      {message.files?.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {message.files.map((f, i) => (
            <div key={i} style={{
              fontSize: '11px', color: 'rgba(0,255,255,0.4)',
              border: '1px solid rgba(0,255,255,0.1)', borderRadius: '6px',
              padding: '4px 8px', fontFamily: 'monospace',
            }}>
              {f.name || 'Arquivo'}
            </div>
          ))}
        </div>
      )}

      {/* Barra de acoes — apenas para mensagens do MORPHEUS */}
      {!isUser && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          marginTop: '10px', paddingTop: '8px',
          borderTop: '1px solid rgba(0,255,255,0.06)',
        }}>
          <ActionButton
            icon={copied ? 'Copiado' : 'Copiar'}
            active={copied}
            onClick={handleCopy}
          />
          <ActionButton
            icon={isSpeaking ? 'Parar' : 'Ouvir'}
            active={isSpeaking}
            onClick={handleSpeak}
          />
          <ActionButton
            icon="Regenerar"
            onClick={() => onRegenerate?.()}
          />
          <span style={{
            marginLeft: 'auto', fontSize: '10px',
            color: 'rgba(0,255,255,0.25)', fontFamily: 'monospace',
          }}>
            {message.model || 'groq/llama-3.3-70b'}
          </span>
          <span style={{
            fontSize: '10px', color: 'rgba(0,255,255,0.25)', fontFamily: 'monospace',
          }}>
            {timeAgo(message.timestamp)}
          </span>
        </div>
      )}
    </div>
  )
}

function ActionButton({ icon, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(0,255,255,0.15)' : 'transparent',
        border: '1px solid rgba(0,255,255,0.1)',
        borderRadius: '6px', padding: '4px 8px',
        color: '#00FFFF', cursor: 'pointer',
        fontSize: '11px', fontFamily: 'monospace',
        transition: 'all 0.2s',
        minWidth: '32px', minHeight: '28px',
      }}
    >
      {icon}
    </button>
  )
}
