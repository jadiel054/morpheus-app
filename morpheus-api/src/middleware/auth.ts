import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt.js'

/**
 * Accepts Bearer JWT issued by Neon auth (/api/auth/login|register).
 * No longer depends on Supabase Auth.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ error: 'Token invalido ou expirado' })
    }
    ;(req as Request & { user?: unknown }).user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Falha na autenticacao' })
  }
}

export const authenticate = authMiddleware
