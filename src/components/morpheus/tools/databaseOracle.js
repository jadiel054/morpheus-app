import supabase from '../../../lib/supabaseClient'

export async function oracleRead(key) {
  try { const { data, error } = await supabase.from('system_status').select('key, value, updated_at').eq('key', key).maybeSingle(); if (error || !data) return { found: false, key, value: null }; return { found: true, key: data.key, value: data.value, updatedAt: data.updated_at } }
  catch { return { found: false, key, value: null } }
}

export async function oracleWrite(key, value) {
  try { const { error } = await supabase.from('system_status').upsert({ key, value: typeof value === 'string' ? value : JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }); if (error) throw error; return { success: true } }
  catch (err) { return { success: false, error: err.message } }
}

export async function oracleReadAll() {
  try { const { data, error } = await supabase.from('system_status').select('key, value, updated_at').order('updated_at', { ascending: false }); if (error) return { rows: [] }; return { rows: data } }
  catch { return { rows: [] } }
}

export async function logAgentSession(agentName, action, metadata = {}) { try { await supabase.from('agent_sessions').insert({ agent_name: agentName, action, metadata }) } catch {} }

export async function getAgentSessions(limit = 20) {
  try { const { data } = await supabase.from('agent_sessions').select('*').order('created_at', { ascending: false }).limit(limit); return data || [] }
  catch { return [] }
}
