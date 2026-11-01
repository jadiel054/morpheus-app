import { createHmac, timingSafeEqual } from 'crypto'

export type JwtPayload = {
  sub: string
  email: string
  name?: string | null
  iat: number
  exp: number
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64url')
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.MORPHEUS_JWT_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET deve ter pelo menos 16 caracteres')
  }
  return secret
}

export function signToken(
  user: { id: string; email: string; display_name?: string | null },
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.display_name || null,
    iat: now,
    exp: now + ttlSeconds,
  }
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const data = `${header}.${body}`
    const expected = createHmac('sha256', getSecret()).update(data).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.sub || !payload.email) return null
    return payload
  } catch {
    return null
  }
}
