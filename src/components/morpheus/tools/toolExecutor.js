// ============================================================
// MORPHEUS Tool Executor — 24 tools with real implementations
// ============================================================

import { listAllRepos, readRepoFile, listRepoContents, commitFile, createBranch, createPullRequest, createRepo, deleteRepo, gitPushHandler, getOwner, getToken } from '../integrations/useGitHub'
import { gitOperatorCommitAndPR, gitOperatorProtocoloExtincao } from './gitOperator'
import { pollDeployStatus, autoDiagnose, applyAutoFix } from './deployAnalyst'
import { sendTelegramMessage } from './telegramOrchestrator'

const GITHUB_API = 'https://api.github.com'

// ====== GITHUB TOOLS ======

export async function github_list_repos() {
  return await listAllRepos()
}

export async function github_read_file({ repo, filePath, owner }) {
  return await readRepoFile(repo, filePath, owner)
}

export async function github_list_files({ repo, path, owner }) {
  return await listRepoContents(repo, path, owner)
}

export async function github_commit_file({ repo, filePath, content, message, branch, owner }) {
  return await commitFile(repo, filePath, content, message, branch, owner)
}

export async function github_create_branch({ repo, branchName, fromBranch, owner }) {
  return await createBranch(repo, branchName, fromBranch, owner)
}

export async function github_create_pr({ repo, title, body, headBranch, baseBranch, owner }) {
  return await createPullRequest(repo, title, body, headBranch, baseBranch, owner)
}

export async function github_create_repo({ name, description, isPrivate }) {
  return await createRepo(name, { description, private: isPrivate })
}

export async function github_delete_repo({ repo, pin }) {
  return await gitOperatorProtocoloExtincao(repo, pin)
}

export async function github_push_all({ repo, filePath, content, description }) {
  return await gitPushHandler(repo, filePath, content, description)
}

// ====== VERCEL TOOLS ======

export async function vercel_list_deploys() {
  return await pollDeployStatus()
}

export async function vercel_get_logs({ deployId }) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const t = i.vercel?.token
    if (!t) return { error: 'Token Vercel nao configurado' }
    const r = await fetch('https://api.vercel.com/v5/deployments/' + deployId + '/events?limit=50', {
      headers: { Authorization: 'Bearer ' + t }
    })
    if (!r.ok) return { error: 'Falha ao buscar logs: ' + r.status }
    return await r.json()
  } catch (err) {
    return { error: err.message }
  }
}

export async function vercel_diagnose({ deployId }) {
  return await autoDiagnose(deployId)
}

// ====== SUPABASE TOOLS ======

export async function supabase_read({ table, query, columns }) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const url = i.supabase?.url
    const key = i.supabase?.anonKey
    if (!url || !key) return { error: 'Supabase nao configurado' }
    let endpoint = url + '/rest/v1/' + table + '?select=' + (columns || '*')
    if (query) endpoint += '&' + new URLSearchParams(query).toString()
    const r = await fetch(endpoint, {
      headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
    })
    if (!r.ok) return { error: 'Supabase read error: ' + r.status }
    return await r.json()
  } catch (err) {
    return { error: err.message }
  }
}

export async function supabase_write({ table, data }) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const url = i.supabase?.url
    const key = i.supabase?.serviceKey || i.supabase?.anonKey
    if (!url || !key) return { error: 'Supabase nao configurado' }
    const r = await fetch(url + '/rest/v1/' + table, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(data)
    })
    if (!r.ok) return { error: 'Supabase write error: ' + r.status }
    return await r.json()
  } catch (err) {
    return { error: err.message }
  }
}

export async function supabase_delete({ table, match }) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const url = i.supabase?.url
    const key = i.supabase?.serviceKey || i.supabase?.anonKey
    if (!url || !key) return { error: 'Supabase nao configurado' }
    const qs = Object.entries(match || {}).map(([k, v]) => k + '=eq.' + encodeURIComponent(v)).join('&')
    const r = await fetch(url + '/rest/v1/' + table + '?' + qs, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=representation' }
    })
    if (!r.ok) return { error: 'Supabase delete error: ' + r.status }
    return await r.json()
  } catch (err) {
    return { error: err.message }
  }
}

// ====== ORACLE TOOLS ======

export async function oracle_read({ key }) {
  try {
    const val = localStorage.getItem('morpheus_oracle_' + key)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

export async function oracle_write({ key, value }) {
  try {
    localStorage.setItem('morpheus_oracle_' + key, JSON.stringify(value))
    return { ok: true, key }
  } catch (err) {
    return { error: err.message }
  }
}

export async function oracle_read_all() {
  try {
    const result = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('morpheus_oracle_')) {
        result[k.replace('morpheus_oracle_', '')] = JSON.parse(localStorage.getItem(k))
      }
    }
    return result
  } catch (err) {
    return { error: err.message }
  }
}

// ====== MEMORY TOOLS ======

export async function memory_save({ key, value, ttl }) {
  try {
    const entry = { value, savedAt: Date.now(), ttl: ttl || null }
    localStorage.setItem('morpheus_memory_' + key, JSON.stringify(entry))
    return { ok: true, key }
  } catch (err) {
    return { error: err.message }
  }
}

export async function memory_search({ query }) {
  try {
    const results = []
    const q = query.toLowerCase()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('morpheus_memory_')) {
        const entry = JSON.parse(localStorage.getItem(k))
        const key = k.replace('morpheus_memory_', '')
        if (key.toLowerCase().includes(q) || JSON.stringify(entry.value).toLowerCase().includes(q)) {
          results.push({ key, value: entry.value, savedAt: entry.savedAt })
        }
      }
    }
    return results.slice(0, 20)
  } catch (err) {
    return { error: err.message }
  }
}

// ====== WEB & NETWORK TOOLS ======

export async function web_search({ query, maxResults }) {
  try {
    const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json')
    const d = await r.json()
    return (d.RelatedTopics || []).slice(0, maxResults || 5).map(t => ({
      title: t.Text?.split(' - ')[0] || t.Text,
      snippet: t.Text,
      url: t.FirstURL,
    }))
  } catch (err) {
    return { error: err.message }
  }
}

export async function scan_url({ url }) {
  try {
    const r = await fetch('https://r.jina.ai/' + url)
    const text = await r.text()
    return { content: text.slice(0, 20000), url }
  } catch (err) {
    return { error: err.message, url }
  }
}

// ====== UTILITY TOOLS ======

export async function get_weather({ city, units }) {
  try {
    const i = JSON.parse(localStorage.getItem('morpheus_integrations') || '{}')
    const key = i.openweather?.apiKey || process.env.OPENWEATHER_API_KEY
    if (!key) return { error: 'OpenWeather API key nao configurada' }
    const r = await fetch('https://api.openweathermap.org/data/2.5/weather?q=' + encodeURIComponent(city) + '&units=' + (units || 'metric') + '&appid=' + key + '&lang=pt')
    if (!r.ok) return { error: 'Weather API error: ' + r.status }
    const d = await r.json()
    return {
      city: d.name,
      temp: d.main?.temp,
      feels_like: d.main?.feels_like,
      humidity: d.main?.humidity,
      description: d.weather?.[0]?.description,
      wind: d.wind?.speed,
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function get_distance({ origin, destination }) {
  try {
    const key = process.env.OPENROUTE_API_KEY
    if (!key) return { error: 'OpenRoute API key nao configurada' }
    const body = { coordinates: [origin, destination], format: 'json' }
    const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return { error: 'Distance API error: ' + r.status }
    const d = await r.json()
    const route = d.routes?.[0]?.summary
    return { distance_km: (route?.distance || 0) / 1000, duration_min: Math.round((route?.duration || 0) / 60) }
  } catch (err) {
    return { error: err.message }
  }
}

export async function calculate({ expression }) {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
    const result = Function('"use strict"; return (' + sanitized + ')')()
    return { expression, result }
  } catch (err) {
    return { error: 'Invalid expression: ' + err.message }
  }
}

export async function convert_currency({ amount, from, to }) {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/' + from)
    const d = await r.json()
    const rate = d.rates?.[to]
    if (!rate) return { error: 'Currency ' + to + ' not found' }
    return { amount, from, to, converted: amount * rate, rate }
  } catch (err) {
    return { error: err.message }
  }
}

// ====== COMMUNICATION TOOLS ======

export async function telegram_send({ botName, message }) {
  return await sendTelegramMessage(botName, message)
}

export async function log_agent_session({ agent, action, metadata }) {
  try {
    const logs = JSON.parse(localStorage.getItem('morpheus_agent_logs') || '[]')
    logs.push({ agent, action, metadata, timestamp: Date.now() })
    if (logs.length > 500) logs.splice(0, logs.length - 500)
    localStorage.setItem('morpheus_agent_logs', JSON.stringify(logs))
    return { ok: true, totalLogs: logs.length }
  } catch (err) {
    return { error: err.message }
  }
}

export async function send_email_alert({ to, subject, body }) {
  try {
    const r = await fetch('/api/email/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    })
    if (!r.ok) return { error: 'Email API error: ' + r.status }
    return await r.json()
  } catch (err) {
    return { error: err.message }
  }
}

export async function sandbox_check({ repo, filePath, content }) {
  try {
    if (filePath?.endsWith('.json')) {
      JSON.parse(content)
    }
    return { verdict: 'OK', repo, filePath }
  } catch (err) {
    return { verdict: 'BLOQUEADO', reason: err.message }
  }
}

// ====== TOOL REGISTRY ======

export const TOOL_REGISTRY = {
  github_list_repos,
  github_read_file,
  github_list_files,
  github_commit_file,
  github_create_branch,
  github_create_pr,
  github_create_repo,
  github_delete_repo,
  github_push_all,
  vercel_list_deploys,
  vercel_get_logs,
  vercel_diagnose,
  supabase_read,
  supabase_write,
  supabase_delete,
  oracle_read,
  oracle_write,
  oracle_read_all,
  memory_save,
  memory_search,
  web_search,
  scan_url,
  get_weather,
  get_distance,
  calculate,
  convert_currency,
  telegram_send,
  log_agent_session,
  send_email_alert,
  sandbox_check,
}

export async function executeToolCall(name, input) {
  const tool = TOOL_REGISTRY[name]
  if (!tool) return { error: 'Tool not found: ' + name }
  try {
    return await tool(input || {})
  } catch (err) {
    return { error: 'Tool execution error: ' + err.message }
  }
}
