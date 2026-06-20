import express from 'express'
import cors from 'cors'
import type { NextFunction, Request, Response } from 'express'
import chatRouter from './routes/chat.js'
import githubRouter from './routes/github.js'
import memoryRouter from './routes/memory.js'
import deployRouter from './routes/deploy.js'
import telegramRouter, { setupTelegramIntegration } from './routes/telegram.js'
import emailRouter from './routes/email.js'
import healthRouter from './routes/health.js'
import credentialsRouter from './routes/credentials.js'
import { authMiddleware } from './middleware/auth.js'
import { rateLimitMiddleware } from './middleware/rateLimit.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(rateLimitMiddleware)

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0', name: 'MORPHEUS Nebuchadnezzar' }))
app.use('/api/health', healthRouter)

app.use('/api/chat', chatRouter)
app.use('/api/credentials', authMiddleware, credentialsRouter)
app.use('/api/github', authMiddleware, githubRouter)
app.use('/api/memory', authMiddleware, memoryRouter)
app.use('/api/deploy', authMiddleware, deployRouter)
app.use('/api/telegram', telegramRouter)
app.use('/api/email', authMiddleware, emailRouter)

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[MORPHEUS API Error]', err)
  res.status(500).json({ error: 'Internal server error', message: err.message })
})

app.listen(PORT, () => {
  console.log(`[MORPHEUS API] Nebuchadnezzar v1.0 running on port ${PORT}`)
  void setupTelegramIntegration()
})

export default app
