const requestCounts = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(maxRequests = 60, windowMs = 60000) {
  return (req: any, res: any, next: any) => {
    const key = req.ip || 'unknown'; const now = Date.now()
    let entry = requestCounts.get(key)
    if (!entry || now > entry.resetAt) { entry = { count: 0, resetAt: now + windowMs }; requestCounts.set(key, entry) }
    entry.count++
    if (entry.count > maxRequests) return res.status(429).json({ error: 'Muitas requisicoes.' })
    next()
  }
}
