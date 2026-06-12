import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { chatRouter } from './routes/chat'
import { githubRouter } from './routes/github'
import { memoryRouter } from './routes/memory'
import { deployRouter } from './routes/deploy'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://morpheus.vercel.app' }))
app.use(express.json({ limit: '10mb' }))

app.use('/api/chat', chatRouter)
app.use('/api/github', githubRouter)
app.use('/api/memory', memoryRouter)
app.use('/api/deploy', deployRouter)

app.get('/health', (_req, res) => res.json({ status: 'online', version: 'Nebuchadnezzar v1.0' }))

app.listen(PORT, () => console.log('[MORPHEUS API] Nebuchadnezzar v1.0 on port ' + PORT))
