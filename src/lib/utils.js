import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) { return twMerge(clsx(inputs)) }

export function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

export function truncate(str, len = 40) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}
