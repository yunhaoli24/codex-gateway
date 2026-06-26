import { setHeader } from 'h3'
import { hostLifecycleBus } from '../../utils/gateway/host-events'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/event-stream')
  setHeader(event, 'cache-control', 'no-cache, no-transform')
  setHeader(event, 'connection', 'keep-alive')
  setHeader(event, 'x-accel-buffering', 'no')

  const response = event.node.res
  const send = (data: unknown, name = 'message') => {
    response.write(`event: ${name}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const unsubscribe = hostLifecycleBus.subscribe((lifecycleEvent) => {
    send(lifecycleEvent)
  })
  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n')
  }, 20_000)

  event.node.req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })

  await new Promise<void>((resolve) => {
    event.node.req.on('close', () => resolve())
  })
})
