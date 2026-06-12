import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/alert', authenticate, async (req, res) => {
  const { to, subject, html } = req.body
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, and html required' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
  }

  try {
    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'MORPHEUS <security@morpheus.app>',
        to,
        subject,
        html,
      }),
    })
    const data = await rsRes.json()
    if (!rsRes.ok) throw new Error(data.message || rsRes.status)
    res.json({ ok: true, id: data.id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/security-alert', authenticate, async (req, res) => {
  const { email, deviceLabel, ipInfo, timestamp } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  const html = `
    <div style="font-family:monospace;background:#050a0f;color:#00FFFF;padding:24px;border:1px solid #0d2030;border-radius:8px;max-width:480px">
      <h2 style="color:#00FFFF;margin:0 0 16px">MORPHEUS — Alerta de Seguranca</h2>
      <p style="color:rgba(0,255,255,0.7);font-size:14px">Um novo dispositivo foi detectado acessando sua conta MORPHEUS.</p>
      <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;margin:16px 0;font-size:13px">
        <p><strong>Dispositivo:</strong> ${deviceLabel || 'Desconhecido'}</p>
        <p><strong>IP:</strong> ${ipInfo?.ip || 'N/A'}</p>
        <p><strong>Localizacao:</strong> ${ipInfo?.city || 'N/A'}, ${ipInfo?.country || 'N/A'}</p>
        <p><strong>Data/Hora:</strong> ${timestamp || new Date().toISOString()}</p>
      </div>
      <p style="font-size:12px;opacity:0.5">Se nao foi voce, altere sua senha imediatamente. Este email foi enviado pelo MORPHEUS Nebuchadnezzar v1.0.</p>
    </div>
  `

  try {
    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND_API_KEY },
      body: JSON.stringify({ from: 'MORPHEUS Security <security@morpheus.app>', to: email, subject: 'MORPHEUS — Novo dispositivo detectado', html })
    })
    const data = await rsRes.json()
    if (!rsRes.ok) throw new Error(data.message || rsRes.status)
    res.json({ ok: true, id: data.id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
