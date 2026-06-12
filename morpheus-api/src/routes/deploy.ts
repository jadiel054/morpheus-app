import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'

export const deployRouter = Router()

deployRouter.get('/list', authMiddleware, async (req: Request, res: Response) => {
  const token = req.headers['x-vercel-token'] as string; const projectId = req.query.projectId as string
  if (!token || !projectId) return res.status(400).json({ error: 'Token Vercel e projectId necessarios' })
  try { const r = await fetch('https://api.vercel.com/v6/deployments?projectId=' + projectId + '&limit=10', { headers: { Authorization: 'Bearer ' + token } }); const d = await r.json(); return res.json(d.deployments || []) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})

deployRouter.get('/logs/:id', authMiddleware, async (req: Request, res: Response) => {
  const token = req.headers['x-vercel-token'] as string
  if (!token) return res.status(400).json({ error: 'Token Vercel necessario' })
  try { const r = await fetch('https://api.vercel.com/v2/deployments/' + req.params.id + '/events', { headers: { Authorization: 'Bearer ' + token } }); return res.json({ logs: await r.text() }) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})
