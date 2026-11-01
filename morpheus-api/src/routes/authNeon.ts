import { Router, type Request, type Response } from 'express'
import { getSql, hasDatabase } from '../lib/db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signToken, verifyToken } from '../lib/jwt.js'

const router = Router()

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

router.get('/status', (_req, res) => {
  res.json({
    provider: 'neon',
    database: hasDatabase(),
    jwt: Boolean(process.env.JWT_SECRET || process.env.MORPHEUS_JWT_SECRET),
  })
})

router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!hasDatabase()) {
      return res.status(503).json({ error: 'DATABASE_URL Neon nao configurada' })
    }
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')
    const displayName = String(req.body?.name || req.body?.display_name || '').trim() || null

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email invalido' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no minimo 6 caracteres' })
    }

    const sql = getSql()
    const existing = await sql`
      SELECT id FROM morpheus_users WHERE lower(email) = ${email} LIMIT 1
    `
    if (existing[0]) {
      return res.status(409).json({ error: 'Este email ja tem uma conta. Faca login.' })
    }

    const passwordHash = await hashPassword(password)
    const rows = await sql`
      INSERT INTO morpheus_users (email, password_hash, display_name)
      VALUES (${email}, ${passwordHash}, ${displayName})
      RETURNING id, email, display_name, created_at
    `
    const user = rows[0] as {
      id: string
      email: string
      display_name: string | null
      created_at: string
    }

    const access_token = signToken(user)
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        created_at: user.created_at,
      },
      access_token,
      token_type: 'Bearer',
      expires_in: 60 * 60 * 24 * 7,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro no registro'
    console.error('[auth/register]', err)
    return res.status(500).json({ error: message })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    if (!hasDatabase()) {
      return res.status(503).json({ error: 'DATABASE_URL Neon nao configurada' })
    }
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')

    if (!email || !password) {
      return res.status(400).json({ error: 'Preencha email e senha' })
    }

    const sql = getSql()
    const rows = await sql`
      SELECT id, email, display_name, password_hash, created_at
      FROM morpheus_users
      WHERE lower(email) = ${email}
      LIMIT 1
    `
    const row = rows[0] as
      | {
          id: string
          email: string
          display_name: string | null
          password_hash: string
          created_at: string
        }
      | undefined

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return res.status(401).json({ error: 'Email ou senha incorretos' })
    }

    await sql`
      UPDATE morpheus_users SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = ${row.id}
    `

    const access_token = signToken(row)
    return res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.display_name,
        created_at: row.created_at,
      },
      access_token,
      token_type: 'Bearer',
      expires_in: 60 * 60 * 24 * 7,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro no login'
    console.error('[auth/login]', err)
    return res.status(500).json({ error: message })
  }
})

router.get('/me', async (req: Request, res: Response) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token nao fornecido' })
    }
    const payload = verifyToken(header.slice(7))
    if (!payload) {
      return res.status(401).json({ error: 'Token invalido ou expirado' })
    }
    return res.json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name || null,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro'
    return res.status(500).json({ error: message })
  }
})

export default router
