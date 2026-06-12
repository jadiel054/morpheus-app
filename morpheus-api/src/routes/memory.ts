import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
export const memoryRouter = Router()

memoryRouter.post('/save', authMiddleware, async (req: Request, res: Response) => {
  const { type, content, metadata, importance } = req.body
  try { const { error } = await supabase.from('morpheus_memory').insert({ type, content, metadata, importance, user_id: (req as any).user.id }); if (error) return res.status(400).json({ error: error.message }); return res.json({ success: true }) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})

memoryRouter.get('/search', authMiddleware, async (req: Request, res: Response) => {
  const query = (req.query.q as string) || ''; const limit = parseInt(req.query.limit as string) || 5
  try { const { data } = await supabase.from('morpheus_memory').select('*').ilike('content', '%' + query + '%').limit(limit); return res.json(data || []) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})
