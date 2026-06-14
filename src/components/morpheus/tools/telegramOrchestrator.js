import { sendNotification } from '../../../lib/pushNotifications'

function getBotToken(botName) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const key = botName.toLowerCase().replace(/\s/g, '')
    // Tenta estrutura aninhada: telegram.morpheuscomando.token
    if (i.telegram?.[key]?.token) return i.telegram[key].token
    // Fallback: chave flat antiga
    if (i[`telegram_${key}`]) return i[`telegram_${key}`]
    return ''
  } catch { return '' }
}

function getChatId(botName) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const key = botName.toLowerCase().replace(/\s/g, '')
    if (i.telegram?.[key]?.chatId) return i.telegram[key].chatId
    return ''
  } catch { return '' }
}

export async function sendTelegramMessage(botName, message, parseMode = 'HTML') {
  try {
    const token = getBotToken(botName)
    if (!token || token.length < 10) {
      console.warn(`[Telegram] Token nao configurado para ${botName}`)
      return { ok: false, error: 'Token nao configurado' }
    }
    const chatId = getChatId(botName)
    if (!chatId) {
      console.warn(`[Telegram] Chat ID nao configurado para ${botName}`)
      return { ok: false, error: 'Chat ID nao configurado' }
    }

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `[${botName}] ${message}`, parse_mode: parseMode }),
    })
    const data = await r.json()
    return { ok: data.ok, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function receiveTelegramMessages() {
  try {
    // Tenta cada bot configurado
    const bots = ['MorpheusComando', 'MorpheusAlerts', 'MorpheusDev', 'MorpheusDebugger',
      'MorpheusAnalytics', 'MorpheusOps', 'MorpheusArchitect', 'MorpheusAuditor',
      'MorpheusTrainer', 'MorpheusMemory']
    const allResults = []
    for (const bot of bots) {
      const token = getBotToken(bot)
      if (!token) continue
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5&timeout=5`)
        const data = await r.json()
        if (data.ok && data.result) {
          for (const upd of data.result) {
            const msg = upd.message
            if (msg?.text) {
              await sendNotification('Telegram', `${msg.from?.first_name || bot}: ${msg.text.slice(0, 60)}`, { tag: 'telegram-msg' })
            }
          }
          allResults.push(...data.result)
        }
      } catch {}
    }
    return allResults
  } catch { return [] }
}

export async function sendTelegramAlert(title, body) {
  await sendNotification('Telegram Alert', `${title} — ${body.slice(0, 80)}`, { tag: 'telegram-alert' })
}

export async function broadcastToAllBots(message) {
  const bots = ['MorpheusComando', 'MorpheusAlerts', 'MorpheusDev', 'MorpheusDebugger',
    'MorpheusAnalytics', 'MorpheusOps', 'MorpheusArchitect', 'MorpheusAuditor',
    'MorpheusTrainer', 'MorpheusMemory']
  const results = []
  for (const bot of bots) {
    const r = await sendTelegramMessage(bot, message)
    results.push({ bot, ok: r.ok })
  }
  return results
}

export { getBotToken, getChatId }
