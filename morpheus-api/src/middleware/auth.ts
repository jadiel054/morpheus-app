import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

function obterSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const supabase = obterSupabaseAuthClient()
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase nao configurado no backend' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token nao fornecido' })
  const token = authHeader.split(' ')[1]
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Token invalido' })
    ;(req as any).user = user
    next()
  } catch { return res.status(401).json({ error: 'Falha na autenticacao' }) }
}

export const authenticate = authMiddleware
