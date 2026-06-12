import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/', authenticate, async (req, res) => {
  const { messages, apiKeys, model } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const sendDone = () => res.write('event: done\ndata: {}\n\n')

  const MAX_LOOPS = 5
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
    ]})

    const groqKey = apiKeys?.groq || process.env.GROQ_API_KEY
    const modelName = model === 'auto' ? 'llama-3.3-70b-versatile' : model || 'llama-3.3-70b-versatile'

    const conversation = [...messages]
    let loopCount = 0
    let finalContent = ''

    while (loopCount < MAX_LOOPS) {
      loopCount++
      sendEvent('plan_update', { step: loopCount === 1 ? 'analyze' : loopCount === 2 ? 'plan' : loopCount === 3 ? 'execute' : 'synthesize', status: 'running' })

      const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
        body: JSON.stringify({ model: modelName, messages: conversation, tools, tool_choice: 'auto', max_tokens: 4096, temperature: 0.7 })
      })

      if (!llmRes.ok) {
        const err = await llmRes.text()
        sendEvent('error', { message: 'LLM error: ' + err })
        sendDone()
        return res.end()
      }

      const llmData = await llmRes.json()
      const choice = llmData.choices?.[0]
      if (!choice) { sendEvent('error', { message: 'No response from LLM' }); sendDone(); return res.end() }

      if (choice.finish_reason === 'tool_calls' && choice.message?.tool_calls?.length) {
        for (const tc of choice.message.tool_calls) {
          const fn = tc.function
          sendEvent('tool_call', { id: tc.id, name: fn.name, arguments: fn.arguments })

          let toolResult = ''
          try {
            if (fn.name === 'web_search') {
              const args = JSON.parse(fn.arguments)
              const sr = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json`)
              const sd = await sr.json()
              toolResult = JSON.stringify(sd.RelatedTopics?.slice(0, 3) || [])
            } else if (fn.name === 'database_query') {
              toolResult = JSON.stringify({ note: 'Database query stub — Supabase client required' })
            } else if (fn.name === 'git_operator') {
              toolResult = JSON.stringify({ note: 'Git operator stub — GitHub token required' })
            }
          } catch (err) {
            toolResult = JSON.stringify({ error: err.message })
          }

          sendEvent('tool_result', { id: tc.id, result: toolResult.slice(0, 2000) })
          conversation.push({ role: 'assistant', content: null, tool_calls: [tc] })
          conversation.push({ role: 'tool', tool_call_id: tc.id, content: toolResult })
        }
        continue
      }

      finalContent = choice.message?.content || ''
      break
    }

    if (!finalContent && loopCount >= MAX_LOOPS) {
      finalContent = '[MORPHEUS] Limite de loops do agente atingido. Tente reformular sua pergunta.'
    }

    sendEvent('content', { content: finalContent, model: modelName, loops: loopCount })
    sendEvent('plan_update', { step: 'synthesize', status: 'done' })
    sendDone()
    res.end()
  } catch (err) {
    sendEvent('error', { message: err.message })
    sendDone()
    res.end()
  }
})

export default router
