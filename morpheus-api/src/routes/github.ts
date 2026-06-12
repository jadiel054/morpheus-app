import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'

export const githubRouter = Router()

githubRouter.get('/repos', authMiddleware, async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })
  try { const r = await fetch('https://api.github.com/user/repos?per_page=100', { headers: { Authorization: 'Bearer ' + token } }); return res.json(await r.json()) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})

githubRouter.post('/commit', authMiddleware, async (req: Request, res: Response) => {
  const { repo, filePath, content, message, branch, owner } = req.body
  const token = req.headers['x-github-token'] as string
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })
  try {
    const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch })
    }); return res.json(await r.json())
  } catch (err) { return res.status(500).json({ error: String(err) }) }
})
