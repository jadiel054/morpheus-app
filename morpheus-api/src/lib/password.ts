import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb)

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const N = 16384
  const r = 8
  const p = 1
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, 32, { N, r, p })) as Buffer
  return [
    'scrypt',
    String(N),
    String(r),
    String(p),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4], 'base64url')
    const expected = Buffer.from(parts[5], 'base64url')
    const derived = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
