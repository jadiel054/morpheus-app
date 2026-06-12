import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()

const MAX_LOOPS = 15
const RETRY_DELAY = 1000
const MAX_LLM_ATTEMPTS = 3
const MAX_BUDGET_TOKENS = 100_000

const READ_ONLY_TOOLS = [
  'github_list_repos', 'github_read_file', 'github_list_files',
  'vercel_list_deploys', 'supabase_read', 'oracle_read', 'oracle_read_all',
  'memory_search', 'web_search', 'get_weather', 'get_distance', 'calculate',
]

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function selectEffortLevel(userMessage) {
  const msg = userMessage.toLowerCase()
  if (/clima|temperatura|hora|piada|calcul|convert/.test(msg)) return 'low'
  if (/refator|architetura|migr|implement|criar.*sistema|bug.*critic/.test(msg)) return 'high'
  return 'medium'
}

function compactHistory(history) {
  const systemMsgs = history.filter(h => h.role === 'system')
  const lastMessages = history.filter(h => h.role !== 'system').slice(-20)
  return [...systemMsgs, ...lastMessages]
}

router.post('/', authenticate, async (req, res) => {
  const { messages, apiKeys, model } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendEvent = (type, data) => {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n')
  }
  const sendDone = () => res.write('event: done\ndata: {}\n\n')

  const effortLevel = selectEffortLevel(messages[messages.length - 1]?.content || '')

  const tools = [
    { type: 'function', function: { name: 'git_operator', description: 'Operate on GitHub repos', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list_repos', 'read_file', 'create_repo'] }, owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' } } } } },
    { type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'database_query', description: 'Query Supabase database', parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } } },
  ]

  try {
    sendEvent('plan', { steps: [
      { id: 'analyze', label: 'Analisando prompt', status: 'pending' },
      { id: 'plan', label: 'Planejando acoes', status: 'pending' },
      { id: 'execute', label: 'Executando ferramentas', status: 'pending' },
      { id: 'synthesize', label: 'Sintetizando resposta', status: 'pending' },
    ], effortLevel })

    const groqKey = apiKeys?.groq || process.env.GROQ_API_KEY
    const modelName = model === 'auto' ? 'llama-3.3-70b-versatile' : model || 'llama-3.3-70b-versatile'

    let conversation = [...messages]
    let loopCount = 0
    let finalContent = ''
    let totalTokensUsed = 0

    while (loopCount < MAX_LOOPS) {
      loopCount++
      sendEvent('plan_update', { step: loopCount === 1 ? 'analyze' : loopCount === 2 ? 'plan' : loopCount === 3 ? 'execute' : 'synthesize', status: 'running' })

      let llmAttempts = 0
      let llmData = null

      while (llmAttempts < MAX_LLM_ATTEMPTS) {
        try {
          const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
            body: JSON.stringify({ model: modelName, messages: conversation, tools, tool_choice: 'auto', max_tokens: 4096, temperature: 0.7 })
          })

          if (!llmRes.ok) {
            const err = await llmRes.text()
            llmAttempts++
            if (llmAttempts >= MAX_LLM_ATTEMPTS) {
              sendEvent('error', { message: 'LLM error after ' + MAX_LLM_ATTEMPTS + ' attempts: ' + err })
              sendDone()
              return res.end()
            }
            sendEvent('thinking', { content: 'Retry ' + llmAttempts + '/' + MAX_LLM_ATTEMPTS + ' apos erro...' })
            await sleep(RETRY_DELAY * llmAttempts)
            continue
          }

          llmData = await llmRes.json()
          break
        } catch (fetchErr) {
          llmAttempts++
          if (llmAttempts >= MAX_LLM_ATTEMPTS) {
            sendEvent('error', { message: 'Network error after ' + MAX_LLM_ATTEMPTS + ' attempts: ' + fetchErr.message })
            sendDone()
            return res.end()
          }
          await sleep(RETRY_DELAY * llmAttempts)
        }
      }

      if (!llmData) continue

      // Budget guard
      totalTokensUsed += llmData.usage?.total_tokens || 0
      if (totalTokensUsed > MAX_BUDGET_TOKENS) {
        sendEvent('thinking', { content: 'Limite de tokens atingido. Resumindo contexto...' })
        conversation = compactHistory(conversation)
        totalTokensUsed = 0
      }

      const choice = llmData.choices?.[0]
      if (!choice) { sendEvent('error', { message: 'No response from LLM' }); sendDone(); return res.end() }

      if (choice.finish_reason === 'tool_calls' && choice.message?.tool_calls?.length) {
        const toolCalls = choice.message.tool_calls

        // Separate read-only and writing tools
        const readOnlyBlocks = toolCalls.filter(tc => READ_ONLY_TOOLS.includes(tc.function.name))
        const writingBlocks = toolCalls.filter(tc => !READ_ONLY_TOOLS.includes(tc.function.name))

        // Execute read-only in parallel
        const readOnlyResults = await Promise.all(
          readOnlyBlocks.map(async (tc) => {
            const fn = tc.function
            sendEvent('tool_call', { id: tc.id, name: fn.name, arguments: fn.arguments })
            const result = await executeTool(fn)
            sendEvent('tool_result', { id: tc.id, result: result.slice(0, 2000) })
            return { tc, result }
          })
        )

        // Execute writing sequentially
        const writingResults = []
        for (const tc of writingBlocks) {
          const fn = tc.function
          sendEvent('tool_call', { id: tc.id, name: fn.name, arguments: fn.arguments })
          const result = await executeTool(fn)
          sendEvent('tool_result', { id: tc.id, result: result.slice(0, 2000) })
          writingResults.push({ tc, result })
        }

        // Push all results to conversation
        conversation.push({ role: 'assistant', content: null, tool_calls: toolCalls })
        for (const { tc, result } of [...readOnlyResults, ...writingResults]) {
          conversation.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }

      finalContent = choice.message?.content || ''
      break
    }

    if (!finalContent && loopCount >= MAX_LOOPS) {
      finalContent = '[MORPHEUS] Limite de loops do agente atingido (' + MAX_LOOPS + '). Tente reformular sua pergunta.'
    }

    sendEvent('content', { content: finalContent, model: modelName, loops: loopCount, tokensUsed: totalTokensUsed })
    sendEvent('plan_update', { step: 'synthesize', status: 'done' })
    sendDone()
    res.end()
  } catch (err) {
    sendEvent('error', { message: err.message })
    sendDone()
    res.end()
  }
})

async function executeTool(fn) {
  try {
    if (fn.name === 'web_search') {
      const args = JSON.parse(fn.arguments)
      const sr = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(args.query) + '&format=json')
      const sd = await sr.json()
      return JSON.stringify(sd.RelatedTopics?.slice(0, 3) || [])
    } else if (fn.name === 'database_query') {
      return JSON.stringify({ note: 'Database query stub — Supabase client required' })
    } else if (fn.name === 'git_operator') {
      return JSON.stringify({ note: 'Git operator stub — GitHub token required' })
    }
    return JSON.stringify({ note: 'Tool ' + fn.name + ' not implemented' })
  } catch (err) {
    return JSON.stringify({ error: err.message })
  }
}

export default router
