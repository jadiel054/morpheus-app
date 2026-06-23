import { Router, Request, Response } from 'express'
import { observabilityStore } from '../lib/observabilityStore.js'

const router = Router()

router.get('/snapshot', (_req: Request, res: Response) => {
  res.json(observabilityStore.getSnapshot())
})

router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (type: string, data: Record<string, unknown>) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const unsubscribe = observabilityStore.subscribe((snapshot) => {
    send('snapshot', snapshot as unknown as Record<string, unknown>)
  })

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
})

export default router
