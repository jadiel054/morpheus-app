import { useState, useRef, useCallback } from 'react'
import { Send, Mic, MicOff, Paperclip, Volume2, VolumeX } from 'lucide-react'
import { processFile, processLink, ALL_ACCEPT_TYPES } from '../../lib/fileAttachmentHandler'

export function ChatInput({ onSend, isLoading, isListening, onToggleMic, isSpeaking, isLiveVoice, onToggleLive, selectedModel = 'auto', onChangeModel }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(
    () => {
      try { return JSON.parse(localStorage.getItem('morpheus_settings') || '{}').voice_enabled !== false }
      catch { return true }
    }
  )
  const fileInputRef = useRef(null)

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!text.trim() && attachments.length === 0) return
    if (isLoading) return
    onSend(text, attachments)
    setText('')
    setAttachments([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = useCallback(async (e) => {
    const pastedText = e.clipboardData.getData('text')
    const pastedFiles = e.clipboardData.files

    if (pastedFiles?.length) {
      e.preventDefault()
      for (const file of Array.from(pastedFiles)) {
        const att = await processFile(file)
        setAttachments(prev => [...prev, att])
      }
      return
    }

    if (/^https?:\/\/\S+$/.test(pastedText.trim())) {
      e.preventDefault()
      const att = await processLink(pastedText.trim())
      setAttachments(prev => [...prev, att])
    }
  }, [])

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      const att = await processFile(file)
      setAttachments(prev => [...prev, att])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files || [])
    for (const file of files) {
      const att = await processFile(file)
      setAttachments(prev => [...prev, att])
    }
  }, [])

  const toggleVoice = () => {
    const newVal = !voiceEnabled
    setVoiceEnabled(newVal)
    const settings = JSON.parse(localStorage.getItem('morpheus_settings') || '{}')
    settings.voice_enabled = newVal
    localStorage.setItem('morpheus_settings', JSON.stringify(settings))
    if (!newVal) window.speechSynthesis?.cancel()
  }

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div
      className={`border-t border-dark-border bg-dark-bg/95 backdrop-blur ${isDragOver ? 'ring-2 ring-cyan/30' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="text-center text-xs text-cyan/50 py-2 border-b border-cyan/10">
          Solte arquivos aqui para anexar
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-2">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-dark-card border border-dark-border rounded px-2 py-1 text-xs">
              {att.type === 'image' && att.preview ? (
                <img src={att.preview} alt="" className="w-5 h-5 rounded object-cover" />
              ) : (
                <Paperclip size={10} />
              )}
              <span className="opacity-70 max-w-[120px] truncate">{att.name?.slice(0, 20)}</span>
              <button onClick={() => removeAttachment(att.id)} className="opacity-40 hover:opacity-100">&times;</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <button
          type="button"
          onClick={openFilePicker}
          className="p-2 opacity-50 hover:opacity-100 transition-opacity"
          title="Anexar arquivo"
        >
          <Paperclip size={16} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALL_ACCEPT_TYPES}
          onChange={handleFileChange}
        />

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Mensagem para o MORPHEUS..."
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-cyan placeholder-cyan/30 font-mono py-2 max-h-32"
        />

        <button
          type="button"
          onClick={onToggleLive}
          className={`p-2 transition-opacity ${isLiveVoice ? 'text-green-400' : 'opacity-50 hover:opacity-100'}`}
          title={isLiveVoice ? 'Modo voz ativo' : 'Ativar modo voz'}
        >
          {isLiveVoice ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        <button
          type="button"
          onClick={onToggleMic}
          className={`p-2 transition-opacity ${isListening ? 'text-red-400' : 'opacity-50 hover:opacity-100'}`}
          title={isListening ? 'Microfone ativo' : 'Ativar microfone'}
        >
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <button
          type="button"
          onClick={toggleVoice}
          title={voiceEnabled ? 'Desativar voz' : 'Ativar voz'}
          style={{
            padding: '8px 12px',
            background: voiceEnabled ? 'rgba(0,255,255,0.15)' : 'rgba(255,0,128,0.1)',
            border: `1px solid ${voiceEnabled ? '#00FFFF' : 'rgba(255,0,128,0.3)'}`,
            borderRadius: '8px',
            color: voiceEnabled ? '#00FFFF' : 'rgba(255,0,128,0.7)',
            fontFamily: 'monospace', fontSize: '12px',
            cursor: 'pointer', letterSpacing: '1px',
            minHeight: '36px',
          }}
        >
          {voiceEnabled ? 'VOZ' : 'VOZ'}
        </button>

        <select
          value={selectedModel}
          onChange={e => onChangeModel?.(e.target.value)}
          className="bg-dark-bg border border-dark-border rounded px-2 py-2 text-[11px] text-cyan font-mono max-w-[170px]"
          title="Selecionar modelo"
        >
          <option value="auto">AUTO</option>
          <option value="groq_llama">GROQ LLAMA</option>
          <option value="groq_mixtral">GROQ MIXTRAL</option>
          <option value="cerebras_llama">CEREBRAS LLAMA</option>
          <option value="anthropic_claude_sonnet">CLAUDE SONNET</option>
          <option value="openrouter_deepseek">DEEPSEEK R1</option>
          <option value="openrouter_qwen">QWEN CODER</option>
          <option value="openrouter_glm">GLM-4</option>
          <option value="google_gemini_flash">GEMINI FLASH</option>
          <option value="openai_gpt4o">GPT-4O</option>
        </select>

        <button
          type="submit"
          disabled={isLoading || (!text.trim() && attachments.length === 0)}
          className="p-2 text-cyan disabled:opacity-30 hover:opacity-100 transition-opacity"
          title="Enviar"
        >
          {isLoading ? <div className="spinner" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  )
}
