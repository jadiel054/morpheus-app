import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/send', authenticate, async (req, res) => {
  const { botId, message, chatId } = req.body
  if (!botId || !message || !chatId) {
    return res.status(400).json({ error: 'botId, message, and chatId required' })
  }

  const tokenKey = `TELEGRAM_BOT_${botId.split('-')[1]}_TOKEN`
  const token = process.env[tokenKey]

  if (!token) {
    return res.status(400).json({ error: `Token not configured for ${botId} (${tokenKey})` })
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
    })
    const data = await tgRes.json()
    if (!tgRes.ok) throw new Error(data.description || tgRes.status)
    res.json({ ok: true, result: data.result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/broadcast', authenticate, async (req, res) => {
  const { message, chatIds } = req.body
  if (!message || !chatIds) {
    return res.status(400).json({ error: 'message and chatIds required' })
  }

  const results = []
  for (let i = 1; i <= 10; i++) {
    const botId = `bot-${i}`
    const chatId = chatIds[botId]
    if (!chatId) continue
    const tokenKey = `TELEGRAM_BOT_${i}_TOKEN`
    const token = process.env[tokenKey]
    if (!token) { results.push({ botId, ok: false, error: 'token not configured' }); continue }
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
      })
      const data = await tgRes.json()
      results.push({ botId, ok: tgRes.ok, result: data.result })
    } catch (err) {
      results.push({ botId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  res.json({ results })
})

export default router
