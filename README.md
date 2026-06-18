# MORPHEUS — Nebuchadnezzar v2.0

**Modular Orchestration & Reasoning Platform for Highly Efficient Unified Systems**

Assistente pessoal de IA de nível enterprise — SPA React + Backend Express/Node.js + Supabase.

Versão atualizada com health check real do backend, validação de tools com Zod, circuit breaker por tool, planner/reflector persistentes e roteamento de modelos com fallback.

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
| Roteamento LLM | Multi-provider por modelo explícito ou primeira credencial válida no modo auto |
| Modelos suportados | Groq, Anthropic, OpenAI, OpenRouter e Google Gemini |
| TTS Principal | ElevenLabs API (streaming) |
| TTS Local | Kokoro-js (browser, ONNX) |
| STT | Web Speech Recognition API |
| Email | Resend API |
| Deploy Frontend | Vercel |
| Deploy Backend | Render |

## v2.0

- `render.yaml` adicionado na raiz para deploy do backend no Render
- `morpheus-api/src/routes/health.ts` criado com verificações reais de Supabase, GitHub, Vercel e provedores LLM configurados
- `src/components/morpheus/tools/toolExecutor.js` atualizado com validação de parâmetros via `zod` e wrapper de circuit breaker
- política de autonomia adicionada para branch temporária, PR e contenção de ações sensíveis
- `src/lib/circuitBreaker.js` e `morpheus-api/src/lib/circuitBreaker.ts` adicionados para controle de falhas por tool
- Engines `planner` e `reflector` criadas no frontend e no backend, com persistência em Supabase
- `modelRouter` e `prompts` centralizados adicionados para seleção de modelo e composição do prompt do sistema
- `morpheus-api/src/routes/chat.ts` reescrito para usar tools reais, fallback de modelos e integração com planner/reflector
- mudanças autônomas de código agora priorizam `branch temporária + PR` em vez de escrita direta na `main`
- SQL de apoio criado em `sql/morpheus_plans.sql` e `sql/morpheus_reflections.sql`

## Matriz de capacidades

| Modelo | ID configurado | Tools | Visão | Comportamento no MORPHEUS |
|--------|----------------|-------|-------|----------------------------|
| Groq Llama 3.3 70B | `llama-3.3-70b-versatile` | Sim | Não | Recebe `tools` em formato OpenAI compatível |
| Groq Mixtral 8x7B | `mixtral-8x7b-32768` | Não | Não | Nunca deve simular tool call; responde com limitação clara |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | Sim | Sim | Recebe `tools` no formato da Messages API e imagens em blocos `image` |
| DeepSeek R1 (OpenRouter) | `deepseek/deepseek-r1` | Sim | Não | Recebe `tools` via OpenRouter quando o modelo/provedor expõe suporte; não recebe imagens |
| Qwen Coder (OpenRouter) | `qwen/qwen-2.5-coder-32b-instruct` | Sim | Não | Recebe `tools` via OpenRouter; não recebe imagens |
| GLM-4 9B (OpenRouter) | `thudm/glm-4-9b` | Não | Não | Nunca deve simular tool call ou visão; responde com limitação clara |
| Gemini Flash (Google) | `gemini-2.0-flash` | Sim | Sim | Recebe `functionDeclarations` e imagens inline no `generateContent` |
| OpenAI GPT-4o | `gpt-4o` | Sim | Sim | Recebe `tools` e partes multimodais no formato Chat Completions |

- Se o modelo atual não suportar `tools`, o backend devolve mensagem específica orientando trocar para um modelo compatível.
- Se houver imagem anexada e o modelo atual não suportar visão, o backend devolve mensagem específica em vez de descartar a imagem silenciosamente.
- `gemini-2.0-flash` continua listado por compatibilidade, mas é um modelo depreciado pelo Google e deve ser migrado em manutenção futura.

## Deploy

- Frontend atual: `https://morpheus-app-six.vercel.app`
- Backend esperado no Render: `https://morpheus-api.onrender.com`
- Endpoint de saúde: `/api/health`
- Endpoint de circuit breaker: `/api/health/circuit-breaker`

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
