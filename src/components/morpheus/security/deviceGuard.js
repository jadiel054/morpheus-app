const DK = 'morpheus_device_id'; const SK = 'morpheus_sessions'; const TK = 'morpheus_trusted_devices'

export function getDeviceId() {
  let id = localStorage.getItem(DK)
  if (!id) { const d = [navigator.userAgent, screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|'); id = 'dev_' + btoa(d).slice(0, 32); localStorage.setItem(DK, id) }
  return id
}

export function getDeviceLabel() { const ua = navigator.userAgent; if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad'; if (/Android/.test(ua)) return 'Android'; if (/Mac/.test(ua)) return 'Mac'; if (/Windows/.test(ua)) return 'Windows'; return 'Navegador' }

export async function getIpInfo() { try { const r = await fetch('https://ipapi.co/json/'); if (!r.ok) return { ip: 'unknown', city: 'unknown', country: 'unknown' }; const d = await r.json(); return { ip: d.ip, city: d.city, country: d.country_name, region: d.region } } catch { return { ip: 'unknown', city: 'unknown', country: 'unknown' } } }

export function isDeviceTrusted(deviceId) { try { return JSON.parse(localStorage.getItem(TK) || '[]').includes(deviceId) } catch { return false } }

export function trustDevice(deviceId) { try { const t = JSON.parse(localStorage.getItem(TK) || '[]'); if (!t.includes(deviceId)) { t.push(deviceId); localStorage.setItem(TK, JSON.stringify(t)) } } catch {} }

export function registerSession() { try { const s = JSON.parse(localStorage.getItem(SK) || '[]'); s.push({ deviceId: getDeviceId(), label: getDeviceLabel(), startedAt: Date.now(), lastSeen: Date.now() }); localStorage.setItem(SK, JSON.stringify(s.slice(-10))) } catch {} }

export function updateSessionLastSeen() { try { const s = JSON.parse(localStorage.getItem(SK) || '[]'); const did = getDeviceId(); localStorage.setItem(SK, JSON.stringify(s.map(x => x.deviceId === did ? { ...x, lastSeen: Date.now() } : x))) } catch {} }

export function revokeAllSessions() { localStorage.setItem(SK, '[]') }
