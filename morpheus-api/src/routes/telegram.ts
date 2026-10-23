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
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
}

function getPublicBackendUrl() {
  return String(
    process.env.BACKEND_URL
    || process.env.API_BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || '',
  ).trim().replace(/\/$/, '')
}

/** When Aegis owns the BotFather webhook, Morpheus must not call setWebhook. */
function telegramManagedByAegis() {
  const owner = String(process.env.TELEGRAM_WEBHOOK_OWNER || process.env.TELEGRAM_MANAGED_BY || '').toLowerCase()
  return owner === 'aegis' || owner === 'aegis-control'
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
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Telegram API ${method}: ${text.slice(0, 200)}`)
  }
  if (!data.ok) {
    throw new Error(data.description || `Telegram API ${method} falhou`)
  }
  return data.result
}

async function sendTelegramText(chatId: string | number, text: string) {
  for (const chunk of chunkTelegramMessage(text)) {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: chunk,
    })
  }
}

async function processTelegramUpdate(update: TelegramUpdate) {
  const incoming = update.message || update.edited_message
  if (!incoming?.chat?.id) return

  const chatId = String(incoming.chat.id)
  const allowed = getTelegramAllowedChatId()
  if (allowed && chatId !== allowed) {
    await sendTelegramText(chatId, 'Chat nao autorizado neste bot.')
    return
  }

  const text = normalizeTelegramText(incoming.text || incoming.caption)
  if (!text) return

  try {
    await telegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })

    // Minimal path: prefer delegating to Aegis when configured
    const aegisUrl = String(process.env.AEGIS_BASE_URL || '').replace(/\/$/, '')
    if (aegisUrl) {
      // Aegis already owns the user-facing webhook; this route is for API/tests only
      await sendTelegramText(
        chatId,
        'Este endpoint do Morpheus nao e o hub principal. Use o webhook do Aegis (Jarvis Comando).',
      )
      return
    }

    const result = await processarPipelineChat({
      message: text,
      source: 'telegram',
      chatId,
    } as any)

    const reply =
      (result as any)?.reply
      || (result as any)?.message
      || (result as any)?.content
      || 'Sem resposta do pipeline.'

    await sendTelegramText(chatId, String(reply))
  } catch (error) {
    console.error('[Telegram] Falha ao processar update:', error)
    await sendTelegramText(
      chatId,
      `Falha ao processar sua mensagem: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function registerTelegramWebhook() {
  if (telegramManagedByAegis()) {
    console.log('[Telegram] TELEGRAM_WEBHOOK_OWNER=aegis — setWebhook ignorado (hub no Aegis)')
    return true
  }

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
  if (telegramManagedByAegis()) {
    console.log('[Telegram] Polling desativado — hub no Aegis')
    return
  }
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

  if (telegramManagedByAegis()) {
    console.log('[Telegram] Gerenciado pelo Aegis — setup de webhook/polling ignorado')
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

  try {
    await sendTelegramText(chatId, message)
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

router.post('/webhook', async (req: Request, res: Response) => {
  const secretToken = getTelegramWebhookSecret()
  if (secretToken) {
    const header = req.header('x-telegram-bot-api-secret-token')
    if (header !== secretToken) {
      console.warn('[Telegram] Webhook rejeitado por secret_token invalido')
      return res.status(401).json({ ok: false, error: 'Webhook secret invalido' })
    }
  }

  res.json({ ok: true })
  void processTelegramUpdate(req.body as TelegramUpdate)
})

router.get('/webhook/status', authenticate, async (_req: Request, res: Response) => {
  try {
    const data = await telegramApi('getWebhookInfo')
    return res.json({ ok: true, webhook: data })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

export default router
