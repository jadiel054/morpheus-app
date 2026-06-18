import { Router, Request, Response } from 'express'

const router = Router()

type ProviderConfig = {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
}

function normalizeApiKey(value: unknown) {
  return String(value || '').trim()
}

function extrairMensagemErro(status: number, bodyText: string) {
  if (!bodyText) return `HTTP ${status}`
  try {
    const json = JSON.parse(bodyText) as Record<string, any>
    return String(
      json?.error?.message ||
      json?.error?.details ||
      json?.message ||
      json?.error ||
      bodyText,
    )
  } catch {
    return bodyText
  }
}

function obterConfigProvider(provider: string, key: string): ProviderConfig | null {
  if (provider === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/models',
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    } satisfies ProviderConfig
  }

  if (provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/models',
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    } satisfies ProviderConfig
  }

  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/models',
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    } satisfies ProviderConfig
  }

  if (provider === 'claude' || provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/models',
      method: 'GET',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
    } satisfies ProviderConfig
  }

  if (provider === 'gemini' || provider === 'google') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      method: 'GET',
      headers: {},
    } satisfies ProviderConfig
  }

  return null
}

router.post('/test', async (req: Request, res: Response) => {
  const provider = String(req.body?.provider || '').trim()
  const key = normalizeApiKey(req.body?.key)

  if (!provider) {
    return res.status(400).json({ ok: false, message: 'Provider nao informado.' })
  }

  if (!key || key.length < 10) {
    return res.status(400).json({ ok: false, message: 'Key vazia ou muito curta apos normalizacao.' })
  }

  const config = obterConfigProvider(provider, key)
  if (!config) {
    return res.status(400).json({ ok: false, message: `Provider desconhecido: ${provider}` })
  }

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
    })

    if (response.ok) {
      return res.json({
        ok: true,
        provider,
        status: response.status,
        message: 'Autenticacao validada com sucesso.',
      })
    }

    const bodyText = await response.text()
    const detalhe = extrairMensagemErro(response.status, bodyText)
    const providerLabel = provider === 'claude' ? 'Anthropic' : provider === 'gemini' ? 'Google Gemini' : provider

    return res.status(response.status).json({
      ok: false,
      provider,
      status: response.status,
      message: `${providerLabel}: ${detalhe}`,
      details: bodyText,
    })
  } catch (error) {
    return res.status(502).json({
      ok: false,
      provider,
      status: 502,
      message: `Erro de rede no backend ao validar ${provider}: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})

export default router
