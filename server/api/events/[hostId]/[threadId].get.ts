import { setHeader } from 'h3'
import { persistence } from '../../../utils/gateway/db'
import { threadBroker } from '../../../utils/gateway/broker'
import { requireRecord } from '../../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const hostId = Number(getRouterParam(event, 'hostId'))
  const threadId = String(getRouterParam(event, 'threadId') || '')
  const afterId = Number(getQuery(event).afterId || 0)
  const host = requireRecord(persistence.getHostWithSecret(hostId), 'Host not found')

  setHeader(event, 'content-type', 'text/event-stream')
  setHeader(event, 'cache-control', 'no-cache, no-transform')
  setHeader(event, 'connection', 'keep-alive')
  setHeader(event, 'x-accel-buffering', 'no')

  const response = event.node.res
  const send = (data: unknown, name = 'message') => {
    response.write(`event: ${name}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  let replaying = true
  const liveQueue: GatewayEvent[] = []
  const sentEventIds = new Set<number>()
  const sendOnce = (gatewayEvent: GatewayEvent) => {
    if (gatewayEvent.id <= afterId || sentEventIds.has(gatewayEvent.id)) {
      return
    }
    sentEventIds.add(gatewayEvent.id)
    send(gatewayEvent)
  }

  const unsubscribe = await threadBroker.subscribe(host, threadId, (gatewayEvent) => {
    if (replaying) {
      liveQueue.push(gatewayEvent)
      return
    }
    sendOnce(gatewayEvent)
  }, () => {
    response.end()
  })

  for (const replay of persistence.listGatewayEvents(hostId, threadId, afterId, 200)) {
    sendOnce(replay)
  }
  replaying = false
  for (const liveEvent of liveQueue) {
    sendOnce(liveEvent)
  }
  liveQueue.length = 0

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
