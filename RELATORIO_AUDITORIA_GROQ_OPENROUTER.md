# Relatório de auditoria Morpheus

## Diagnóstico OpenRouter

- Causa raiz 1:
  A migração de credenciais legadas no frontend gravava caminhos como texto literal, por exemplo `"openrouter.key"`, em vez de montar o objeto aninhado `openrouter.key`. Com isso, o chat lia `integrations.openrouter?.key` e podia não encontrar a credencial mesmo quando ela existia no armazenamento local.
- Evidência encontrada:
  Em `src/pages/Morpheus.jsx`, a rotina `migrateOldKeys()` usava caminho com ponto, mas salvava em propriedade plana; além disso, havia migração de `deepseek_key` para `deepseek.key`, enquanto o pipeline do chat buscava apenas a chave do provider `openrouter`.
- Arquivo / linhas:
  `src/pages/Morpheus.jsx` nas áreas de migração e resolução de chaves, agora em torno de `43-147` e `467-523`.
- Correção aplicada:
  Corrigi a migração para criar estrutura aninhada, tratei caminhos planos já persistidos, unifiquei aliases legados (`deepseek`, `qwen`, `glm`) como `openrouter` e passei a resolver essas aliases tanto no chat quanto no painel de observabilidade.

- Causa raiz 2:
  Havia divergência entre o nome do provider informado em testes e aliases reais do ecossistema OpenRouter.
- Evidência encontrada:
  O backend de teste de credenciais aceitava o provider cru, sem normalização para aliases como `deepseek`, `qwen` e `glm`.
- Arquivo / linhas:
  `morpheus-api/src/routes/credentials.ts` em torno de `15-24`.
- Correção aplicada:
  Adicionei normalização explícita do provider para consolidar aliases OpenRouter, Anthropic e Google no backend.

- Observabilidade adicionada:
  Em `morpheus-api/src/routes/chat.ts`, o pipeline agora emite diagnóstico temporário com provider, modelo, quantidade de mensagens, tokens estimados, tamanho do contexto, presença de API key e presença do header de autenticação antes da chamada HTTP.

## Diagnóstico Groq

- Causa raiz 1:
  O backend sempre montava um prompt de sistema muito grande e o anexava a toda requisição, somando isso ao histórico recente, tools, resultados de tools e loops internos.
- Evidência encontrada:
  `morpheus-api/src/routes/chat.ts` criava o `contextoSistema` com `montarPrompt('planejamento', ...)` e mantinha o histórico em memória com compactação tardia; a proteção só agia depois do consumo acumulado do pipeline, não antes de cada request.
- Arquivo / linhas:
  `morpheus-api/src/routes/chat.ts` em torno de `1195-1252`.
- Correção aplicada:
  Passei a compactar o prompt de sistema, compactar o histórico antes de cada chamada ao modelo, estimar tokens por requisição e emitir telemetria temporária do contexto.

- Causa raiz 2:
  Resultados de tools e repetições de chamadas podiam inflar o contexto rapidamente, especialmente em loops.
- Evidência encontrada:
  O histórico recebia resultados completos das tools e não havia trava para repetição idêntica de tool call dentro do mesmo pipeline.
- Arquivo / linhas:
  `morpheus-api/src/routes/chat.ts` em torno de `1264-1271` e `1548-1556`.
- Correção aplicada:
  Limitei o tamanho dos resultados de tools que retornam para a conversa, adicionei detecção de repetição excessiva da mesma tool com os mesmos argumentos e mantive compactação mais agressiva do histórico.

- Causa raiz 3:
  O frontend ainda enviava histórico demais para o backend e não consolidava corretamente algumas chaves antigas do provider.
- Evidência encontrada:
  `src/pages/Morpheus.jsx` enviava até 10 mensagens anteriores e não resolvia todos os formatos legados de chave.
- Arquivo / linhas:
  `src/pages/Morpheus.jsx` em torno de `510-523` e `621`.
- Correção aplicada:
  Reduzi o histórico enviado para 6 mensagens, passei o `systemPrompt` explicitamente para o backend e consolidei a resolução de chaves legadas e aliases.

## Melhorias implementadas

- Compactação de contexto por orçamento antes de cada chamada de LLM.
- Limite de tamanho para prompt de sistema.
- Limite de tamanho para resultados de tools reintroduzidos na conversa.
- Detecção de loop interno por repetição da mesma tool com os mesmos argumentos.
- Normalização de aliases OpenRouter no frontend e backend.
- Observabilidade temporária via SSE e `console.info` no backend.

## Riscos encontrados

- O sistema ainda depende de prompt-base muito extenso; agora ele está contido por compactação, mas ainda merece futura modularização.
- Há código legado no frontend para várias integrações e formatos antigos de armazenamento; novos aliases devem seguir uma convenção única.
- O backend ainda permite até 15 loops, embora agora com contenção de contexto e repetição.

## Recomendações futuras

- Extrair configuração de providers e aliases para um módulo compartilhado entre frontend e backend.
- Separar prompt-base em blocos menores por capacidade, ativando apenas o necessário para cada tipo de tarefa.
- Persistir métricas de contexto/tokens por request em tabela própria de observabilidade.
- Criar testes automatizados para migração de credenciais legadas e para compactação de histórico.

## Validação executada

- `npm run build` em `morpheus-app`
- `npm run build` em `morpheus-api`
