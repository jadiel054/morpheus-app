import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) { return twMerge(clsx(inputs)) }

export function timeAgo(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  if (hours < 48) return 'ontem'
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit'
  })
}

export function timeAgoFull(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min atras`
  const date = new Date(timestamp)
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hoje as ${timeStr}`
  if (hours < 48) return `ontem as ${timeStr}`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` as ${timeStr}`
}

export function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

export function truncate(str, len = 40) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}
