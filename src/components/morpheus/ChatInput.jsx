import { useState, useRef } from 'react'
import { Send, Mic, MicOff, Paperclip, Volume2, VolumeX } from 'lucide-react'
import { processFile, processLink } from '../../lib/fileAttachmentHandler'

export function ChatInput({ onSend, isLoading, isListening, onToggleMic, isSpeaking, isLiveVoice, onToggleLive }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)
  const handleSubmit = (e) => { e?.preventDefault(); if (!text.trim() && attachments.length === 0) return; if (isLoading) return; onSend(text, attachments); setText(''); setAttachments([]) }
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }
  const handlePaste = async (e) => { const pasted = e.clipboardData.getData('text'); if (/^https?:\/\/\S+$/.test(pasted.trim())) { e.preventDefault(); const att = await processLink(pasted.trim()); setAttachments(prev => [...prev, att]) } }
  const handleFileChange = async (e) => { const files = Array.from(e.target.files || []); for (const file of files) { const att = await processFile(file); setAttachments(prev => [...prev, att]) } }
  return (
    <div className="border-t border-dark-border bg-dark-bg/95 backdrop-blur">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-2">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-dark-card border border-dark-border rounded px-2 py-1 text-xs">
              {att.type === 'image' && att.preview ? <img src={att.preview} alt="" className="w-5 h-5 rounded object-cover" /> : <Paperclip size={10} />}
              <span className="opacity-70">{att.name?.slice(0, 20)}</span>
              <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="opacity-40 hover:opacity-100">&times;</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 opacity-50 hover:opacity-100"><Paperclip size={16} /></button>
        <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.docx,.xlsx,.csv,.html,.js,.ts,.jsx,.tsx,.py,.txt,.md,.json,.yaml,.sql" onChange={handleFileChange} />
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="Mensagem para o MORPHEUS..." rows={1} className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-cyan placeholder-cyan/30 font-mono py-2 max-h-32" />
        <button type="button" onClick={onToggleLive} className={`p-2 ${isLiveVoice ? 'text-green-400' : 'opacity-50 hover:opacity-100'}`}>{isLiveVoice ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        <button type="button" onClick={onToggleMic} className={`p-2 ${isListening ? 'text-red-400' : 'opacity-50 hover:opacity-100'}`}>{isListening ? <MicOff size={16} /> : <Mic size={16} />}</button>
        <button type="submit" disabled={isLoading || (!text.trim() && attachments.length === 0)} className="p-2 text-cyan disabled:opacity-30 hover:opacity-100">{isLoading ? <div className="spinner" /> : <Send size={16} />}</button>
      </form>
    </div>
  )
}
