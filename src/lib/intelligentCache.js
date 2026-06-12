const DEFAULT_TTL = {
  web_search: 3600000,
  llm_response: 300000,
  github_repo: 600000,
  github_file: 300000,
  vercel_deploy: 30000,
  weather: 1800000,
  memory_context: 60000,
  user_profile: 300000,
}

class IntelligentCache {
  constructor() {
    this.store = new Map()
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 }
    this.maxEntries = 500
  }

  get(key, namespace = 'default') {
    const fullKey = `${namespace}:${key}`
    const entry = this.store.get(fullKey)
    if (!entry) { this.stats.misses++; return null }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(fullKey)
      this.stats.evictions++
      this.stats.misses++
      return null
    }
    this.stats.hits++
    entry.lastAccessed = Date.now()
    return entry.value
  }

  set(key, value, namespace = 'default', ttlOverride = null) {
    const fullKey = `${namespace}:${key}`
    const ttl = ttlOverride ?? DEFAULT_TTL[namespace] ?? 300000

    if (this.store.size >= this.maxEntries) {
      let oldest = null
      for (const [k, v] of this.store) {
        if (!oldest || v.lastAccessed < oldest.lastAccessed) oldest = { key: k, ...v }
      }
      if (oldest) { this.store.delete(oldest.key); this.stats.evictions++ }
    }

    this.store.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl,
    })
    this.stats.sets++
  }

  has(key, namespace = 'default') {
    return this.get(key, namespace) !== null
  }

  delete(key, namespace = 'default') {
    return this.store.delete(`${namespace}:${key}`)
  }

  clear(namespace = null) {
    if (namespace) {
      for (const key of this.store.keys()) {
        if (key.startsWith(`${namespace}:`)) this.store.delete(key)
      }
    } else {
      this.store.clear()
    }
  }

  async getOrFetch(key, namespace, fetcher, ttlOverride = null) {
    const cached = this.get(key, namespace)
    if (cached !== null) return cached
    const value = await fetcher()
    this.set(key, value, namespace, ttlOverride)
    return value
  }

  getStats() {
    return { ...this.stats, size: this.store.size, maxEntries: this.maxEntries }
  }

  getByNamespace(namespace) {
    const entries = []
    for (const [key, entry] of this.store) {
      if (key.startsWith(`${namespace}:`)) {
        entries.push({ key: key.slice(namespace.length + 1), ...entry, isExpired: Date.now() > entry.expiresAt })
      }
    }
    return entries
  }

  warmup(entries) {
    for (const { key, value, namespace, ttl } of entries) {
      this.set(key, value, namespace || 'default', ttl || null)
    }
  }

  invalidateByPattern(pattern, namespace = 'default') {
    const regex = new RegExp(pattern)
    let count = 0
    for (const key of this.store.keys()) {
      const prefix = `${namespace}:`
      if (key.startsWith(prefix) && regex.test(key.slice(prefix.length))) {
        this.store.delete(key)
        count++
      }
    }
    return count
  }
}

export const cache = new IntelligentCache()
export default cache
