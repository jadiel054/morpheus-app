import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { rateLimit } from '../middleware/rateLimit'

export const chatRouter = Router()

chatRouter.post('/', authMiddleware, rateLimit(30, 60000), async (req: Request, res: Response) => {
  const { messages, apiKeys } = req.body
  try {
    if (apiKeys?.groq) {
      const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKeys.groq },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 4096, temperature: 0.7 })
      })
      if (gr.ok) { const d = await gr.json(); return res.json({ content: d.choices?.[0]?.message?.content || '', model: 'groq/llama-3.3-70b' }) }
    }
    return res.status(500).json({ error: 'Nenhum LLM disponivel' })
  } catch (err) { return res.status(500).json({ error: 'Erro: ' + String(err) }) }
})
