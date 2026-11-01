import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let sql: NeonQueryFunction<false, false> | null = null

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL (Neon) nao configurada')
  }
  if (!sql) {
    sql = neon(url)
  }
  return sql
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL)
}
