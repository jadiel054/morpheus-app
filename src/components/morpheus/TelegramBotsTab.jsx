import { useState } from 'react'
import { Send, Bot, MessageSquare, Shield, Brain, Cloud, GitBranch, Terminal, Music, Users, Settings, Check, Loader2 } from 'lucide-react'
import { getBots, sendToBot, getBotsByCategory } from '../../lib/telegramOrchestrator'

const BOT_ICONS = {
  'bot-1': Brain, 'bot-2': Cloud, 'bot-3': GitBranch, 'bot-4': Shield, 'bot-5': Brain,
  'bot-6': Users, 'bot-7': Terminal, 'bot-8': Terminal, 'bot-9': Music, 'bot-10': Settings,
}

export function TelegramBotsTab({ env = {}, chatIds = {} }) {
  const bots = getBots()
  const categories = getBotsByCategory()
  const [testResults, setTestResults] = useState({})
  const [testingId, setTestingId] = useState(null)

  const handleTest = async (bot) => {
    setTestingId(bot.id)
    const chatId = chatIds[bot.id]
    if (!chatId) {
      setTestResults(prev => ({ ...prev, [bot.id]: { ok: false, error: 'chatId nao configurado' } }))
      setTestingId(null)
      return
    }
    try {
      await sendToBot(bot.id, 'Teste de conexao MORPHEUS Nebuchadnezzar v1.0 — ' + new Date().toLocaleString('pt-BR'), chatId, env)
      setTestResults(prev => ({ ...prev, [bot.id]: { ok: true } }))
    } catch (err) {
      setTestResults(prev => ({ ...prev, [bot.id]: { ok: false, error: err.message } }))
    }
    setTestingId(null)
  }

  return (
    <div className="telegram-bots-tab">
      <style>{`
        .telegram-bots-tab { padding: 16px; }
        .bots-section-title { font-size: 0.65rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.1em; margin: 16px 0 8px; }
        .bots-section-title:first-child { margin-top: 0; }
        .bot-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--dark-border); border-radius: 8px; margin-bottom: 6px; background: var(--dark-card); transition: all 0.15s; }
        .bot-row:hover { border-color: rgba(0,255,255,0.2); }
        .bot-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(0,255,255,0.06); flex-shrink: 0; }
        .bot-info { flex: 1; min-width: 0; }
        .bot-name { font-size: 0.75rem; color: var(--cyan); }
        .bot-desc { font-size: 0.6rem; opacity: 0.5; }
        .bot-username { font-size: 0.55rem; opacity: 0.3; }
        .bot-status { display: flex; align-items: center; gap: 6px; }
        .bot-status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .bot-status-dot--ok { background: #00ff66; }
        .bot-status-dot--err { background: #ff4444; }
        .bot-status-dot--off { background: rgba(255,255,255,0.2); }
        .bot-test-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--dark-border); background: none; color: var(--cyan); cursor: pointer; transition: all 0.15s; }
        .bot-test-btn:hover { border-color: var(--cyan); background: rgba(0,255,255,0.1); }
        .bot-test-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .bot-chat-id { font-size: 0.55rem; opacity: 0.3; margin-top: 2px; }
      `}</style>

      {Object.entries(categories).map(([catKey, catBots]) => (
        <div key={catKey}>
          <div className="bots-section-title">{catKey === 'core' ? 'Core' : catKey === 'integrations' ? 'Integracoes' : catKey === 'utilities' ? 'Utilitarios' : 'Admin'}</div>
          {catBots.map(bot => {
            const Icon = BOT_ICONS[bot.id] || Bot
            const result = testResults[bot.id]
            const isTesting = testingId === bot.id
            const chatId = chatIds[bot.id]
            return (
              <div key={bot.id} className="bot-row">
                <div className="bot-icon"><Icon size={16} opacity={0.7} /></div>
                <div className="bot-info">
                  <div className="bot-name">{bot.name}</div>
                  <div className="bot-desc">{bot.description}</div>
                  <div className="bot-username">@{bot.username}</div>
                  {chatId && <div className="bot-chat-id">chat: {chatId}</div>}
                </div>
                <div className="bot-status">
                  <span className={`bot-status-dot ${result?.ok ? 'bot-status-dot--ok' : result?.error ? 'bot-status-dot--err' : chatId ? 'bot-status-dot--ok' : 'bot-status-dot--off'}`} />
                  <button className="bot-test-btn" onClick={() => handleTest(bot)} disabled={isTesting} title="Testar conexao">
                    {isTesting ? <Loader2 size={12} className="animate-spin" /> : result?.ok ? <Check size={12} /> : <Send size={12} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
