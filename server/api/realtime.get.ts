import type { GatewayEvent, RealtimeClientMessage, RealtimeServerMessage } from '~~/shared/types'
import { randomUUID } from 'node:crypto'
import { threadBroker } from '../utils/gateway/broker'
import { runtimeState } from '../utils/gateway/runtime-state'
import { hostLifecycleBus } from '../utils/gateway/host-events'
import { requireRecord } from '../utils/gateway/validation'

type Peer = Parameters<NonNullable<Parameters<typeof defineWebSocketHandler>[0]['open']>>[0]

interface RealtimePeerState {
  hostLifecycleUnsubscribe?: () => void
  threadUnsubscribers: Map<string, () => void>
}

function threadTopicKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`
}

function send(peer: Peer, message: RealtimeServerMessage) {
  peer.send(JSON.stringify(message))
}

function parseClientMessage(raw: string): RealtimeClientMessage {
  const parsed = JSON.parse(raw) as RealtimeClientMessage
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    throw new Error('Invalid realtime message')
  }
  return parsed
}

function stateFor(peer: Peer) {
  let state = peer.context.realtime as RealtimePeerState | undefined
  if (!state) {
    state = { threadUnsubscribers: new Map() }
    peer.context.realtime = state
  }
  return state
}

async function subscribeThread(peer: Peer, message: Extract<RealtimeClientMessage, { type: 'thread.subscribe' }>) {
  const hostId = Number(message.hostId)
  const threadId = String(message.threadId || '')
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    throw new Error('Invalid thread subscription')
  }

  const state = stateFor(peer)
  const key = threadTopicKey(hostId, threadId)
  state.threadUnsubscribers.get(key)?.()

  const host = requireRecord(runtimeState.getHostWithSecret(hostId), 'Host not found')
  const afterId = Number(message.afterId || 0)
  const sentEventIds = new Set<number>()
  const sendOnce = (event: GatewayEvent) => {
    if (event.id <= afterId || sentEventIds.has(event.id)) {
      return
    }
    sentEventIds.add(event.id)
    send(peer, { type: 'thread.event', event })
  }

  let replaying = true
  const liveQueue: GatewayEvent[] = []
  const unsubscribe = await threadBroker.subscribe(host, threadId, (event) => {
    if (replaying) {
      liveQueue.push(event)
      return
    }
    sendOnce(event)
  }, () => {
    send(peer, { type: 'thread.closed', hostId, threadId })
  })
  state.threadUnsubscribers.set(key, unsubscribe)

  for (const event of runtimeState.listGatewayEvents(hostId, threadId, afterId, 200)) {
    sendOnce(event)
  }
  replaying = false
  for (const event of liveQueue) {
    sendOnce(event)
  }
  liveQueue.length = 0
}

function unsubscribeThread(peer: Peer, message: Extract<RealtimeClientMessage, { type: 'thread.unsubscribe' }>) {
  const hostId = Number(message.hostId)
  const threadId = String(message.threadId || '')
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    return
  }
  const state = stateFor(peer)
  const key = threadTopicKey(hostId, threadId)
  state.threadUnsubscribers.get(key)?.()
  state.threadUnsubscribers.delete(key)
}

function subscribeHostLifecycle(peer: Peer) {
  const state = stateFor(peer)
  state.hostLifecycleUnsubscribe?.()
  state.hostLifecycleUnsubscribe = hostLifecycleBus.subscribe((event) => {
    send(peer, { type: 'host.lifecycle', event })
  })
}

function unsubscribeHostLifecycle(peer: Peer) {
  const state = stateFor(peer)
  state.hostLifecycleUnsubscribe?.()
  state.hostLifecycleUnsubscribe = undefined
}

function cleanup(peer: Peer) {
  const state = stateFor(peer)
  state.hostLifecycleUnsubscribe?.()
  state.hostLifecycleUnsubscribe = undefined
  for (const unsubscribe of state.threadUnsubscribers.values()) {
    unsubscribe()
  }
  state.threadUnsubscribers.clear()
}

export default defineWebSocketHandler({
  open(peer) {
    stateFor(peer)
    send(peer, { type: 'ready', connectionId: randomUUID() })
  },

  async message(peer, message) {
    let request: RealtimeClientMessage | undefined
    try {
      request = parseClientMessage(message.text())
      if (request.type === 'host.lifecycle.subscribe') {
        subscribeHostLifecycle(peer)
      } else if (request.type === 'host.lifecycle.unsubscribe') {
        unsubscribeHostLifecycle(peer)
      } else if (request.type === 'thread.subscribe') {
        await subscribeThread(peer, request)
      } else if (request.type === 'thread.unsubscribe') {
        unsubscribeThread(peer, request)
      } else if (request.type === 'ping') {
        send(peer, { type: 'pong', nonce: request.nonce })
      }
    } catch (error: any) {
      send(peer, {
        type: 'error',
        message: error?.message || 'Realtime message failed',
        request,
      })
    }
  },

  close(peer) {
    cleanup(peer)
  },

  error(peer) {
    cleanup(peer)
  },
})
