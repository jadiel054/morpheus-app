# CHANGELOG R5

## Resumo

Implementação da v2.0 do MORPHEUS com foco em robustez operacional, observabilidade e preparação para execução real no backend.

## Entregas

- Adicionado `render.yaml` na raiz para deploy do backend no Render.
- Criado `morpheus-api/src/routes/health.ts` com verificações reais de Supabase, Groq, GitHub, Vercel e OpenRouter.
- Adicionado endpoint `GET /api/health/circuit-breaker`.
- Corrigidos problemas estruturais no backend:
  - export ausente de `rateLimitMiddleware`
  - alias `authenticate` no middleware de autenticação
  - `default export` ausente em rotas
  - imports locais sem extensão `.js`
  - erros de tipagem em `catch`
- Adicionado `zod` no frontend e no backend.
- Atualizado `src/components/morpheus/tools/toolExecutor.js` com:
  - schemas de validação
  - normalização de parâmetros
  - wrapper de circuit breaker por tool
- Criados:
  - `src/lib/circuitBreaker.js`
  - `src/lib/prompts.js`
  - `src/components/morpheus/agents/plannerEngine.js`
  - `src/components/morpheus/agents/reflectorEngine.js`
  - `src/components/morpheus/agents/modelRouter.js`
  - `morpheus-api/src/lib/circuitBreaker.ts`
  - `morpheus-api/src/lib/prompts.ts`
  - `morpheus-api/src/lib/supabaseAdmin.ts`
  - `morpheus-api/src/agents/plannerEngine.ts`
  - `morpheus-api/src/agents/reflectorEngine.ts`
  - `morpheus-api/src/agents/modelRouter.ts`
- Reescrito `morpheus-api/src/routes/chat.ts` com:
  - tools reais para GitHub, Supabase e busca web
  - planner e reflector por conversa
  - fallback de modelos
  - guard de orçamento de tokens
  - execução paralela para tools de leitura
  - branch temporária + PR por padrão para alterações autônomas em código
- Adicionada política de autonomia:
  - `src/lib/autonomyPolicy.js`
  - `morpheus-api/src/lib/autonomyPolicy.ts`
- Expandido o roteamento de agentes para:
  - `Agente Bot Manager`
  - `Agente System Builder`
- Adicionados os arquivos SQL:
  - `sql/morpheus_plans.sql`
  - `sql/morpheus_reflections.sql`
- Atualizado `README.md` para a v2.0.

## Validação

- `npm install` executado no frontend
- `npm install` executado no backend
- `npm run build` executado com sucesso no frontend
- `npm run build` executado com sucesso no backend

## Pendências externas

- Configurar variáveis no Render e validar `GET /api/health`
- Executar SQL no Supabase
- Rodar testes reais com credenciais válidas e serviços ativos
