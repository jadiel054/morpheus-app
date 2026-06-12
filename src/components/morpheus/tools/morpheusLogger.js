export const LOG_TYPES = { AI: 'AI', GITHUB: 'GITHUB', DEPLOY: 'DEPLOY', MEMORY: 'MEMORY', SECURITY: 'SECURITY', TELEGRAM: 'TELEGRAM' }

export function logAction({ type, description, status = 'success', model }) {
  const entry = { type, description, status, model, timestamp: Date.now() }
  try { const logs = JSON.parse(localStorage.getItem('morpheus_action_log') || '[]'); logs.push(entry); localStorage.setItem('morpheus_action_log', JSON.stringify(logs.slice(-500))) } catch {}
  console.log('[MORPHEUS:' + type + ']', description, status)
}
