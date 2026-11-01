import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export function hashPassword(password: string): string {
  const N = 16384
  const r = 8
  const p = 1
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 32, { N, r, p })
  return [
    'scrypt',
    String(N),
    String(r),
    String(p),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4], 'base64url')
    const expected = Buffer.from(parts[5], 'base64url')
    const derived = scryptSync(password, salt, expected.length, { N, r, p })
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
