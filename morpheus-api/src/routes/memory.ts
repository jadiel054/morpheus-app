import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { createClient } from '@supabase/supabase-js'

export const memoryRouter = Router()

function obterSupabaseMemoryClient() {
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

memoryRouter.post('/save', authMiddleware, async (req: Request, res: Response) => {
  const supabase = obterSupabaseMemoryClient()
  if (!supabase) return res.status(500).json({ error: 'Supabase nao configurado no backend' })
  const { type, content, metadata, importance } = req.body
  try { const { error } = await supabase.from('morpheus_memory').insert({ type, content, metadata, importance, user_id: (req as any).user.id }); if (error) return res.status(400).json({ error: error.message }); return res.json({ success: true }) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})

memoryRouter.get('/search', authMiddleware, async (req: Request, res: Response) => {
  const supabase = obterSupabaseMemoryClient()
  if (!supabase) return res.status(500).json({ error: 'Supabase nao configurado no backend' })
  const query = (req.query.q as string) || ''; const limit = parseInt(req.query.limit as string) || 5
  try { const { data } = await supabase.from('morpheus_memory').select('*').ilike('content', '%' + query + '%').limit(limit); return res.json(data || []) }
  catch (err) { return res.status(500).json({ error: String(err) }) }
})

export default memoryRouter
