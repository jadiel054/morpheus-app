const BOTS = [
  { id: 'bot-1', name: 'MORPHEUS Core', username: 'morpheus_core_bot', tokenKey: 'TELEGRAM_BOT_1_TOKEN', description: 'Assistente principal — responde comandos e conversa' },
  { id: 'bot-2', name: 'MORPHEUS Deploy', username: 'morpheus_deploy_bot', tokenKey: 'TELEGRAM_BOT_2_TOKEN', description: 'Notifica status de deploys Vercel/Render' },
  { id: 'bot-3', name: 'MORPHEUS GitHub', username: 'morpheus_github_bot', tokenKey: 'TELEGRAM_BOT_3_TOKEN', description: 'Notifica commits, PRs e issues' },
  { id: 'bot-4', name: 'MORPHEUS Security', username: 'morpheus_security_bot', tokenKey: 'TELEGRAM_BOT_4_TOKEN', description: 'Alertas de seguranca — novos dispositivos, logins' },
  { id: 'bot-5', name: 'MORPHEUS Memory', username: 'morpheus_memory_bot', tokenKey: 'TELEGRAM_BOT_5_TOKEN', description: 'Resumos diarios de memoria e contexto' },
  { id: 'bot-6', name: 'MORPHEUS Tasks', username: 'morpheus_tasks_bot', tokenKey: 'TELEGRAM_BOT_6_TOKEN', description: 'Lista e gerencia tarefas do KAIROS' },
  { id: 'bot-7', name: 'MORPHEUS Code', username: 'morpheus_code_bot', tokenKey: 'TELEGRAM_BOT_7_TOKEN', description: 'Code review e snippets via LLM' },
  { id: 'bot-8', name: 'MORPHEUS Logs', username: 'morpheus_logs_bot', tokenKey: 'TELEGRAM_BOT_8_TOKEN', description: 'Stream de logs do sistema em tempo real' },
  { id: 'bot-9', name: 'MORPHEUS Voice', username: 'morpheus_voice_bot', tokenKey: 'TELEGRAM_BOT_9_TOKEN', description: 'Recebe audio e transcreve/responde' },
  { id: 'bot-10', name: 'MORPHEUS Admin', username: 'morpheus_admin_bot', tokenKey: 'TELEGRAM_BOT_10_TOKEN', description: 'Comandos administrativos — restart, config, status' },
]

export function getBots() { return BOTS }

export async function sendToBot(botId, message, chatId, env = {}) {
  const bot = BOTS.find(b => b.id === botId)
  if (!bot) throw new Error('Bot nao encontrado: ' + botId)
  const token = env[bot.tokenKey]
  if (!token) throw new Error('Token nao configurado para ' + bot.name + ' (' + bot.tokenKey + ')')
  if (!chatId) throw new Error('chatId obrigatorio para enviar mensagem ao Telegram')

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const body = { chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }

  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error('Telegram API error: ' + (err.description || res.status))
  }
  return res.json()
}

export async function broadcastToAll(message, chatIds, env = {}) {
  const results = []
  for (const bot of BOTS) {
    const chatId = chatIds[bot.id]
    if (!chatId) continue
    try {
      const result = await sendToBot(bot.id, message, chatId, env)
      results.push({ botId: bot.id, ok: true, result })
    } catch (err) {
      results.push({ botId: bot.id, ok: false, error: err.message })
    }
  }
  return results
}

export async function sendToGroup(botIds, message, chatIds, env = {}) {
  const results = []
  for (const botId of botIds) {
    const chatId = chatIds[botId]
    if (!chatId) { results.push({ botId, ok: false, error: 'chatId nao configurado' }); continue }
    try {
      const result = await sendToBot(botId, message, chatId, env)
      results.push({ botId, ok: true, result })
    } catch (err) {
      results.push({ botId, ok: false, error: err.message })
    }
  }
  return results
}

export function getBotById(id) { return BOTS.find(b => b.id === id) }
export function getBotsByCategory() {
  return {
    core: BOTS.slice(0, 2),
    integrations: BOTS.slice(2, 5),
    utilities: BOTS.slice(5, 8),
    admin: BOTS.slice(8, 10),
  }
}
