import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'

export const githubRouter = Router()

githubRouter.get('/repos', authMiddleware, async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })
  try {
    const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

githubRouter.get('/repos/:owner/:repo', authMiddleware, async (req: Request, res: Response) => {
  const { owner, repo } = req.params
  const token = req.headers['x-github-token'] as string
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

githubRouter.get('/repos/:owner/:repo/contents/:path(*)', authMiddleware, async (req: Request, res: Response) => {
  const { owner, repo, path } = req.params
  const token = req.headers['x-github-token'] as string
  if (!token) return res.status(400).json({ error: 'Token GitHub necessario' })
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

githubRouter.post('/commit', authMiddleware, async (req: Request, res: Response) => {
  const { owner, repo, filePath, content, message, branch } = req.body
  const token = req.headers['x-github-token'] as string
  if (!token || !owner || !repo || !filePath || !content) {
    return res.status(400).json({ error: 'Token, owner, repo, filePath, and content required' })
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: message || 'Update via MORPHEUS',
        content: Buffer.from(content).toString('base64'),
        branch: branch || 'main',
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

githubRouter.post('/create-repo', authMiddleware, async (req: Request, res: Response) => {
  const { name, description, isPrivate } = req.body
  const token = req.headers['x-github-token'] as string
  if (!token || !name) return res.status(400).json({ error: 'Token and name required' })
  try {
    const r = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({ name, description, private: isPrivate || false, auto_init: true }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

export default githubRouter
