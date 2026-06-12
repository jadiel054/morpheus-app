import { sendNotification } from '../../../lib/pushNotifications'

export async function sendTelegramMessage(botName, message) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.telegram?.botToken
    const chatId = i.telegram?.chatId
    if (!token || !chatId) return { ok: false, error: 'Telegram nao configurado' }

    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '[' + botName + '] ' + message, parse_mode: 'HTML' })
    })
    const data = await r.json()
    return data
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function receiveTelegramMessages() {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const token = i.telegram?.botToken
    if (!token) return []

    const r = await fetch('https://api.telegram.org/bot' + token + '/getUpdates?limit=10&timeout=5')
    const data = await r.json()
    if (!data.ok) return []

    for (const upd of data.result || []) {
      const msg = upd.message
      if (msg?.text) {
        await sendNotification('Telegram', (msg.from?.first_name || 'Bot') + ': ' + msg.text.slice(0, 60), { tag: 'telegram-msg' })
      }
    }
    return data.result || []
  } catch {
    return []
  }
}

export async function sendTelegramAlert(title, body) {
  await sendNotification('Telegram Alert', title + ' — ' + body.slice(0, 80), { tag: 'telegram-alert' })
}

export async function broadcastToAllBots(message) {
  const bots = ['MorpheusAlerts', 'MorpheusLogs', 'MorpheusDeploy']
  const results = []
  for (const bot of bots) {
    const r = await sendTelegramMessage(bot, message)
    results.push({ bot, ok: r.ok })
  }
  return results
}
