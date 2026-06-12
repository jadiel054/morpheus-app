export const DEPLOY_PLATFORMS = {
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    icon: 'Cloud',
    color: '#000000',
    docs: 'https://vercel.com/docs',
    envPrefix: 'VERCEL_',
    requiredTokens: ['VERCEL_TOKEN'],
    deployCommand: 'vercel --prod',
    configFile: 'vercel.json',
    defaultConfig: { framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist', installCommand: 'npm install' },
  },
  render: {
    id: 'render',
    name: 'Render',
    icon: 'Server',
    color: '#46E3B7',
    docs: 'https://render.com/docs',
    envPrefix: 'RENDER_',
    requiredTokens: ['RENDER_API_KEY'],
    deployCommand: null,
    configFile: 'render.yaml',
    defaultConfig: { type: 'web_service', env: 'node', buildCommand: 'npm install && npm run build', startCommand: 'node morpheus-api/dist/index.js', plan: 'starter' },
  },
  railway: {
    id: 'railway',
    name: 'Railway',
    icon: 'TrainTrack',
    color: '#8B5CF6',
    docs: 'https://docs.railway.app',
    envPrefix: 'RAILWAY_',
    requiredTokens: ['RAILWAY_TOKEN'],
    deployCommand: null,
    configFile: null,
    defaultConfig: { builder: 'nixpacks', buildCommand: 'npm run build', startCommand: 'node morpheus-api/dist/index.js' },
  },
  netlify: {
    id: 'netlify',
    name: 'Netlify',
    icon: 'Globe',
    color: '#00C7B7',
    docs: 'https://docs.netlify.com',
    envPrefix: 'NETLIFY_',
    requiredTokens: ['NETLIFY_AUTH_TOKEN'],
    deployCommand: 'netlify deploy --prod',
    configFile: 'netlify.toml',
    defaultConfig: { build: { command: 'npm run build', publish: 'dist' }, functions: { directory: 'netlify/functions' } },
  },
}

export function getPlatform(platformId) {
  return DEPLOY_PLATFORMS[platformId] || null
}

export function getAllPlatforms() {
  return Object.values(DEPLOY_PLATFORMS)
}

export function getPlatformConfig(platformId, overrides = {}) {
  const platform = DEPLOY_PLATFORMS[platformId]
  if (!platform) return null
  return { ...platform.defaultConfig, ...overrides }
}

export function generateVercelConfig(overrides = {}) {
  return JSON.stringify({
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    ...overrides,
  }, null, 2)
}

export function generateRenderConfig(overrides = {}) {
  const config = {
    services: [{
      type: 'web_service',
      name: 'morpheus-api',
      env: 'node',
      buildCommand: 'npm install && npm run build',
      startCommand: 'node morpheus-api/dist/index.js',
      plan: 'starter',
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3001' },
      ],
      ...overrides,
    }],
  }
  return JSON.stringify(config, null, 2)
}

export function generateNetlifyConfig(overrides = {}) {
  return `[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`
}

export function validatePlatformConfig(platformId, env = {}) {
  const platform = DEPLOY_PLATFORMS[platformId]
  if (!platform) return { valid: false, missing: [], error: 'Plataforma desconhecida' }
  const missing = platform.requiredTokens.filter(tk => !env[tk])
  return { valid: missing.length === 0, missing, platform: platform.name }
}
