import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/authContext'
import { supabase } from '../../lib/supabaseClient'

export function ConversationHistory({ onClose, onLoad }) {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(null)

  const loadConversations = async () => {
    if (!user) { setLoading(false); return }
    try {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, last_message_at, messages')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(50)
      setConversations(data || [])
    } catch (err) {
      console.error('[ConversationHistory] Erro:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConversations() }, [user])

  const handleRename = async (conv) => {
    const newTitle = prompt('Novo nome:', conv.title)
    if (!newTitle) return
    try {
      await supabase.from('conversations').update({ title: newTitle }).eq('id', conv.id)
      loadConversations()
    } catch (err) { console.error(err) }
  }

  const handlePin = async (conv) => {
    const title = conv.title?.startsWith('📌 ') ? conv.title.slice(3) : `📌 ${conv.title}`
    try {
      await supabase.from('conversations').update({ title }).eq('id', conv.id)
      loadConversations()
    } catch (err) { console.error(err) }
  }

  const handleDelete = async (conv) => {
    if (!confirm(`Apagar "${conv.title}"?`)) return
    try {
      await supabase.from('conversations').delete().eq('id', conv.id)
      loadConversations()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-dark-card border-l border-dark-border z-30 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <h2 className="text-sm text-cyan font-bold">HISTORICO</h2>
        <button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center p-4"><div className="ldrs-dot-pulse"><span/><span/><span/></div></div>
        ) : conversations.length === 0 ? (
          <p className="text-xs opacity-40 p-4">Nenhuma conversa salva.</p>
        ) : (
          conversations.map(conv => (
            <div key={conv.id} style={{
              display: 'flex', alignItems: 'center',
              padding: '10px 16px', cursor: 'pointer',
              borderBottom: '1px solid rgba(0,255,255,0.05)',
              gap: '8px',
            }}>
              <div
                onClick={() => onLoad(conv)}
                style={{ flex: 1, overflow: 'hidden' }}
              >
                <div style={{ color: '#00FFFF', fontSize: '13px', fontFamily: 'monospace',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {conv.title}
                </div>
                <div style={{ color: 'rgba(0,255,255,0.4)', fontSize: '11px', fontFamily: 'monospace' }}>
                  {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString('pt-BR') : ''}
                  {' · '}{conv.messages?.length || 0} msgs
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === conv.id ? null : conv.id) }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'rgba(0,255,255,0.5)', cursor: 'pointer',
                    fontSize: '18px', padding: '4px 8px', borderRadius: '4px',
                  }}
                >...</button>
                {menuOpen === conv.id && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 100,
                    background: '#0a1520', border: '1px solid #0d2030',
                    borderRadius: '8px', minWidth: '160px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}>
                    {[
                      { icon: '✏️', label: 'Renomear', action: () => handleRename(conv) },
                      { icon: '📌', label: 'Fixar',   action: () => handlePin(conv) },
                      { icon: '🗑️', label: 'Apagar',  action: () => handleDelete(conv), danger: true },
                    ].map(({ icon, label, action, danger }) => (
                      <button key={label} onClick={() => { action(); setMenuOpen(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          width: '100%', padding: '10px 14px', background: 'transparent',
                          border: 'none', color: danger ? '#ff0080' : '#00FFFF',
                          fontFamily: 'monospace', fontSize: '13px', cursor: 'pointer',
                          textAlign: 'left',
                        }}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
