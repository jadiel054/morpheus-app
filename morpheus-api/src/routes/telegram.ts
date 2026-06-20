import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import { processarPipelineChat } from './chat.js'

const router = Router()

type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    caption?: string
    chat?: { id?: number | string, type?: string }
    from?: { id?: number | string, username?: string, first_name?: string }
  }
  edited_message?: {
    message_id?: number
    text?: string
    caption?: string
    chat?: { id?: number | string, type?: string }
    from?: { id?: number | string, username?: string, first_name?: string }
  }
}

const TELEGRAM_API_BASE = 'https://api.telegram.org'
let pollingStarted = false
let pollingOffset = 0

function getTelegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
}

function getTelegramAllowedChatId() {
  return String(process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHATID || '6151151338').trim()
}

function getTelegramWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || `${getTelegramBotToken().slice(0, 12)}-jarvis-webhook`).trim()
}

function getPublicBackendUrl() {
  return String(
    process.env.BACKEND_URL
    || process.env.API_BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || '',
  ).trim().replace(/\/$/, '')
}

function normalizeTelegramText(value: unknown) {
  return String(value || '').trim()
}

function chunkTelegramMessage(text: string, maxLength = 3900) {
  const chunks: string[] = []
  let remaining = text.trim()

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength)
    const splitAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
    const cut = splitAt > 100 ? splitAt : maxLength
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks.length ? chunks : ['Sem conteúdo para enviar.']
}

async function telegramApi(method: string, body?: Record<string, unknown>) {
  const token = getTelegramBotToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN nao configurado')

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (!response.ok || data.ok === false) {
    throw new Error(String(data.description || data.error_code || text || `Telegram HTTP ${response.status}`))
  }

  return data
}

async function sendTelegramText(chatId: string, text: string) {
  const chunks = chunkTelegramMessage(text)
  for (const chunk of chunks) {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    })
  }
}

async function sendTelegramTyping(chatId: string) {
  try {
    await telegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })
  } catch (error) {
    console.warn('[Telegram] Falha ao enviar typing:', error)
  }
}

function extractIncomingMessage(update: TelegramUpdate) {
  const message = update.message || update.edited_message
  if (!message?.chat?.id) return null

  return {
    chatId: String(message.chat.id),
    text: normalizeTelegramText(message.text || message.caption || ''),
    senderId: String(message.from?.id || ''),
    senderName: normalizeTelegramText(message.from?.username || message.from?.first_name || ''),
  }
}

async function processTelegramUpdate(update: TelegramUpdate) {
  const incoming = extractIncomingMessage(update)
  if (!incoming) return

  const allowedChatId = getTelegramAllowedChatId()
  if (allowedChatId && incoming.chatId !== allowedChatId) {
    console.warn(`[Telegram] Update ignorado para chat nao autorizado: ${incoming.chatId}`)
    return
  }

  if (!incoming.text) {
    await sendTelegramText(incoming.chatId, 'Envie uma mensagem de texto para eu responder.')
    return
  }

  await sendTelegramTyping(incoming.chatId)

  try {
    const resultado = await processarPipelineChat({
      messages: [{ role: 'user', content: incoming.text }],
      conversationId: `telegram-${incoming.chatId}`,
      model: 'auto',
    })

    await sendTelegramText(incoming.chatId, resultado.content || 'Não consegui gerar uma resposta agora.')
  } catch (error) {
    console.error('[Telegram] Falha ao processar update:', error)
    await sendTelegramText(
      incoming.chatId,
      `Falha ao processar sua mensagem: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function registerTelegramWebhook() {
  const publicUrl = getPublicBackendUrl()
  if (!publicUrl) return false

  const webhookUrl = `${publicUrl}/api/telegram/webhook`
  const secretToken = getTelegramWebhookSecret()

  await telegramApi('setWebhook', {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false,
  })

  console.log(`[Telegram] Webhook registrado em ${webhookUrl}`)
  return true
}

async function pollTelegramUpdates() {
  try {
    const data = await telegramApi('getUpdates', {
      timeout: 0,
      offset: pollingOffset,
      allowed_updates: ['message', 'edited_message'],
    }) as { result?: TelegramUpdate[] }

    for (const update of data.result || []) {
      pollingOffset = Math.max(pollingOffset, Number(update.update_id || 0) + 1)
      await processTelegramUpdate(update)
    }
  } catch (error) {
    console.error('[Telegram] Falha no polling:', error)
  }
}

function startTelegramPolling() {
  if (pollingStarted) return
  pollingStarted = true
  console.log('[Telegram] Iniciando polling como fallback')
  void pollTelegramUpdates()
  setInterval(() => { void pollTelegramUpdates() }, 5000)
}

export async function setupTelegramIntegration() {
  const token = getTelegramBotToken()
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN nao configurado; integração desativada')
    return
  }

  try {
    const webhookOk = await registerTelegramWebhook()
    if (!webhookOk) startTelegramPolling()
  } catch (error) {
    console.error('[Telegram] Falha ao registrar webhook; ativando polling:', error)
    startTelegramPolling()
  }
}

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

router.post('/webhook', async (req: Request, res: Response) => {
  const secretToken = getTelegramWebhookSecret()
  const headerSecret = normalizeTelegramText(req.header('x-telegram-bot-api-secret-token'))

  if (secretToken && headerSecret && headerSecret !== secretToken) {
    return res.status(401).json({ ok: false, error: 'Webhook secret invalido' })
  }

  const update = req.body as TelegramUpdate
  res.status(200).json({ ok: true })
  void processTelegramUpdate(update)
})

router.get('/webhook/status', authenticate, async (_req: Request, res: Response) => {
  try {
    const data = await telegramApi('getWebhookInfo')
    res.json({ ok: true, data })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

export default router
