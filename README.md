# MORPHEUS — Nebuchadnezzar v1.0

**Modular Orchestration & Reasoning Platform for Highly Efficient Unified Systems**

Assistente pessoal de IA de nível enterprise — SPA React + Backend Express/Node.js + Supabase.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS v3 + shadcn/ui |
| Roteamento | React Router DOM v6 |
| Data Fetching | @tanstack/react-query v5 |
| Animações | Framer Motion v11 + LDRS custom system |
| Ícones | Lucide React |
| Backend | Express.js + Node.js (TypeScript) |
| Autenticação | Supabase Auth (JWT) |
| Banco de dados | Supabase (PostgreSQL) |
| LLM Primário | Groq (Llama 3.3 70B / Mixtral 8x7B) |
| LLM Secundário | OpenRouter (Qwen Coder, DeepSeek R1, Claude, GPT-4o) |
| TTS Principal | ElevenLabs API (streaming) |
| TTS Local | Kokoro-js (browser, ONNX) |
| STT | Web Speech Recognition API |
| Email | Resend API |
| Deploy Frontend | Vercel |
| Deploy Backend | Render |

## Estrutura

```
morpheus-app/
├── src/
│   ├── pages/              # Morpheus.jsx, Home, SecurityBlock, DigitalAssets, ExportSource, DownloadSchema
│   ├── components/morpheus/
│   │   ├── agents/         # agentRouter, agentPrompts, memoryEngine, evolutionEngine, personalityEngine, kairosEngine
│   │   ├── tools/          # gitOperator, databaseOracle, vectorMemory, webSearch, deployAnalyst, morpheusLogger
│   │   ├── integrations/   # useGitHub, useVercel, sandboxRunner
│   │   ├── security/       # WebAuthnManager, deviceGuard
│   │   ├── useKokoroTTS.js # TTS local via ONNX
│   │   ├── useVoiceLive.js # STT via Web Speech API
│   │   └── useElevenLabs.js# TTS premium via ElevenLabs
│   └── lib/                # supabaseClient, authContext, utils, ttsDispatcher, fileAttachmentHandler, pushNotifications
├── morpheus-api/           # Backend Express/Node.js TypeScript
│   └── src/
│       ├── routes/         # chat, github, memory, deploy
│       ├── services/       # llmRouter, githubService, supabaseAdmin
│       └── middleware/      # auth, rateLimit
├── sql/                    # Schema Supabase PostgreSQL
├── public/                 # manifest.json, sw.js, ícones PWA
└── package.json
```

## Agentes

| Agente | Gatilhos |
|--------|---------|
| Agente Maps | rota, distância, endereço, localização |
| Agente Busca Web | pesquisar online, notícia, informação atual |
| Agente Full-stack | arquitetura, projeto, deploy, app completo |
| Agente Dev Web | browser, nginx, cors, seo, http, domínio |
| Agente Dev Mobile | apk, flutter, react native, expo, android |
| Agente Frontend | css, layout, tailwind, ui, ux, componente |
| Agente Backend | api, servidor, banco de dados, express, supabase |
| Agente Clima | temperatura, chuva, previsão, meteorologia |
| Analista Estratégico | analisar repo, planejar, delegar zarith, estratégia |

## Tools

- **gitOperator**: CRUD de repositórios, leitura de arquivos, Protocolo Extinção (com PIN)
- **databaseOracle**: Leitura/escrita no Supabase (system_status)
- **vectorMemory**: Memória semântica local (text similarity)
- **webSearch**: Brave Search + DuckDuckGo fallback
- **deployAnalyst**: Polling de deploys Vercel + diagnóstico
- **morpheusLogger**: Log de ações (AI, GitHub, Deploy, Memory, Security)

## Segurança

- **WebAuthn / Biometria**: Face ID, Touch ID, Windows Hello
- **PIN de Emergência**: Proteção para ações sensíveis (Protocolo Extinção)
- **Device Guard**: Fingerprint de dispositivo, detecção de novo dispositivo
- **Email de Alerta**: Notificação em caso de acesso de dispositivo não reconhecido

## UI/UX

- **Tema**: Matrix/terminal HUD — dark mode, cyan neon, scanlines
- **LDRS**: Sistema próprio de 10 animações de loading (spinner, dot-pulse, helix, waveform, orbit, quantum, grid, cursor-blink, bouncy, cardio)
- **Splash Screen**: Sequência de boot estilo terminal
- **Conversation Tabs**: Múltiplas conversas simultâneas
- **Settings Panel**: Perfil, Voz, IA, Integrações, Segurança

## Criador

**Jadiel** — Xanxerê/Santa Catarina, Brasil  
Desenvolvedor freelancer, estudante SENAC, mobile-only (Android)

> "Não existe colher." — Matrix
