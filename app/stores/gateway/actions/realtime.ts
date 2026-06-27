import type { GatewayEvent, RealtimeClientMessage, RealtimeServerMessage, ThreadTokenUsageState } from '~~/shared/types'
import { toast } from 'vue-sonner'
import type { GatewayStoreContext, ThreadRuntimeStatus } from '../types'
import {
  pinnedKey,
  runtimeStatusFromAppThreadStatus,
  terminalTurnStatus,
  threadIdFromParams,
} from '../thread-utils'

export function createRealtimeActions(ctx: GatewayStoreContext) {
  const lifecycleNotificationKeys = new Set<string>()

  return {
    connectRealtime() {
      if (!import.meta.client) {
        return
      }
      const existing = ctx.state.realtimeSocket
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return
      }
      if (ctx.state.realtimeSocketReconnectTimer) {
        window.clearTimeout(ctx.state.realtimeSocketReconnectTimer)
        ctx.state.realtimeSocketReconnectTimer = null
      }

      const generation = ctx.state.realtimeSocketGeneration + 1
      ctx.state.realtimeSocketGeneration = generation
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`)
      ctx.state.realtimeSocket = socket

      socket.addEventListener('open', () => {
        if (ctx.state.realtimeSocketGeneration !== generation) {
          socket.close()
          return
        }
        ctx.state.realtimeSocketConnected = true
        ctx.state.realtimeSocketReconnectAttempt = 0
        ctx.resubscribeRealtime()
      })

      socket.addEventListener('message', (message) => {
        if (ctx.state.realtimeSocketGeneration !== generation) {
          return
        }
        ctx.handleRealtimeMessage(JSON.parse(String(message.data)) as RealtimeServerMessage)
      })

      socket.addEventListener('close', () => {
        if (ctx.state.realtimeSocketGeneration !== generation) {
          return
        }
        ctx.state.realtimeSocketConnected = false
        ctx.state.realtimeSocket = null
        ctx.scheduleRealtimeReconnect()
      })

      socket.addEventListener('error', () => {
        socket.close()
      })
    },

    scheduleRealtimeReconnect() {
      if (!import.meta.client || ctx.state.realtimeSocketReconnectTimer) {
        return
      }
      const attempt = ctx.state.realtimeSocketReconnectAttempt + 1
      ctx.state.realtimeSocketReconnectAttempt = attempt
      const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt - 1, 5))
      ctx.state.realtimeSocketReconnectTimer = window.setTimeout(() => {
        ctx.state.realtimeSocketReconnectTimer = null
        ctx.connectRealtime()
      }, delay)
    },

    sendRealtime(message: RealtimeClientMessage) {
      ctx.connectRealtime()
      const socket = ctx.state.realtimeSocket
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false
      }
      socket.send(JSON.stringify(message))
      return true
    },

    resubscribeRealtime() {
      if (ctx.state.realtimeHostLifecycleSubscribed) {
        ctx.sendRealtime({ type: 'host.lifecycle.subscribe' })
      }
      for (const subscription of Object.values(ctx.state.realtimeThreadSubscriptions)) {
        ctx.sendRealtime({
          type: 'thread.subscribe',
          hostId: subscription.hostId,
          threadId: subscription.threadId,
          afterId: subscription.afterId,
        })
      }
    },

    connectHostLifecycleEvents() {
      if (!import.meta.client) {
        return
      }
      ctx.state.realtimeHostLifecycleSubscribed = true
      ctx.connectRealtime()
      ctx.sendRealtime({ type: 'host.lifecycle.subscribe' })
    },

    handleHostLifecycleRealtime(event: Extract<RealtimeServerMessage, { type: 'host.lifecycle' }>['event']) {
      const eventTime = event.createdAt ? Date.parse(event.createdAt) : Date.now()
      const current = ctx.state.hostConnectionStatuses[event.hostId]
      if (current?.updatedAt && Number.isFinite(eventTime) && eventTime < current.updatedAt) {
        return
      }
      ctx.state.hostConnectionStatuses = {
        ...ctx.state.hostConnectionStatuses,
        [event.hostId]: {
          status: event.status,
          message: event.message,
          updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now(),
        },
      }
      const notifyKey = `${event.hostId}:${event.status}:${event.message}`
      if ((event.status === 'upgrading' || event.status === 'restarting') && !lifecycleNotificationKeys.has(notifyKey)) {
        lifecycleNotificationKeys.add(notifyKey)
        toast.info(event.message)
      }
    },

    handleRealtimeThreadEvent(event: GatewayEvent) {
      const eventKey = pinnedKey(event.hostId, event.threadId)
      const snapshotLastEventId = ctx.state.threadSnapshots[eventKey]?.lastEventId ?? 0
      const currentLastEventId = event.hostId === ctx.state.selectedHostId && event.threadId === ctx.state.selectedThreadId
        ? ctx.state.lastEventId
        : 0
      if (event.id <= Math.max(snapshotLastEventId, currentLastEventId)) {
        return
      }
      if (event.hostId === ctx.state.selectedHostId && event.threadId === ctx.state.selectedThreadId) {
        ctx.state.lastEventId = event.id
        ctx.state.events.push(event)
        if (ctx.state.events.length > 500) {
          ctx.state.events.shift()
        }
      }
      ctx.recordThreadEvent(event)
      ctx.applyLiveEvent(event)
      const subscription = ctx.state.realtimeThreadSubscriptions[eventKey]
      if (subscription && event.id > subscription.afterId) {
        ctx.state.realtimeThreadSubscriptions = {
          ...ctx.state.realtimeThreadSubscriptions,
          [eventKey]: {
            ...subscription,
            afterId: event.id,
          },
        }
      }
    },

    handleRealtimeMessage(message: RealtimeServerMessage) {
      if (message.type === 'host.lifecycle') {
        ctx.handleHostLifecycleRealtime(message.event)
      } else if (message.type === 'thread.event') {
        ctx.handleRealtimeThreadEvent(message.event)
      } else if (message.type === 'thread.closed') {
        ctx.retryThreadSubscription(message.hostId, message.threadId)
      } else if (message.type === 'error') {
        ctx.setError(message.message)
      }
    },

    retryThreadSubscription(hostId: number, threadId: string) {
      if (!import.meta.client) {
        return
      }
      const key = pinnedKey(hostId, threadId)
      window.setTimeout(() => {
        const subscription = ctx.state.realtimeThreadSubscriptions[key]
        if (!subscription) {
          return
        }
        ctx.sendRealtime({
          type: 'thread.subscribe',
          hostId: subscription.hostId,
          threadId: subscription.threadId,
          afterId: subscription.afterId,
        })
      }, 1_000)
    },

    setThreadRunning(hostId: number, threadId: string, running: boolean) {
      ctx.setThreadStatus(hostId, threadId, running ? 'running' : 'completed')
    },

    setThreadStatus(hostId: number, threadId: string, status: ThreadRuntimeStatus) {
      const key = pinnedKey(hostId, threadId)
      const current = new Set(ctx.state.runningThreadKeys)
      ctx.state.threadStatuses = {
        ...ctx.state.threadStatuses,
        [key]: status,
      }
      if (status === 'running') {
        current.add(key)
      } else {
        current.delete(key)
      }
      ctx.state.runningThreadKeys = [...current]
    },

    setThreadTokenUsage(hostId: number, threadId: string, tokenUsage: ThreadTokenUsageState) {
      ctx.state.threadTokenUsageByKey = {
        ...ctx.state.threadTokenUsageByKey,
        [pinnedKey(hostId, threadId)]: tokenUsage,
      }
    },

    connectEvents(hostId = ctx.state.selectedHostId, threadId = ctx.state.selectedThreadId) {
      if (!hostId || !threadId) {
        return
      }

      const key = pinnedKey(hostId, threadId)
      const afterId = ctx.state.threadSnapshots[key]?.lastEventId ?? (
        hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId ? ctx.state.lastEventId : 0
      )
      const subscription = { hostId, threadId, afterId }
      ctx.state.realtimeThreadSubscriptions = {
        ...ctx.state.realtimeThreadSubscriptions,
        [key]: subscription,
      }
      ctx.connectRealtime()
      ctx.sendRealtime({ type: 'thread.subscribe', ...subscription })
    },

    closeThreadEvents(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId)
      const { [key]: _closed, ...subscriptions } = ctx.state.realtimeThreadSubscriptions
      ctx.state.realtimeThreadSubscriptions = subscriptions
      ctx.sendRealtime({ type: 'thread.unsubscribe', hostId, threadId })
    },

    recordThreadEvent(event: GatewayEvent) {
      const key = pinnedKey(event.hostId, event.threadId)
      const snapshot = ctx.state.threadSnapshots[key]
      if (!snapshot) {
        return
      }
      if (event.id <= snapshot.lastEventId) {
        return
      }
      const events = [...snapshot.events, event].slice(-500)
      ctx.state.threadSnapshots[key] = {
        ...snapshot,
        events,
        lastEventId: event.id,
      }
    },

    applyLiveEvent(event: GatewayEvent) {
      const payload = event.payload as any
      const params = payload?.params || {}
      if (event.method === 'thread/status/changed') {
        const threadId = threadIdFromParams(params)
        if (threadId) {
          ctx.events.emit({
            type: 'thread-status-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            status: runtimeStatusFromAppThreadStatus(params.status),
          })
        }
      } else if (event.method === 'turn/started') {
        const threadId = threadIdFromParams(params)
        if (threadId) {
          ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId: String(threadId), status: 'running' })
        }
      } else if (event.method === 'turn/completed') {
        const threadId = threadIdFromParams(params)
        if (threadId) {
          ctx.events.emit({
            type: 'thread-status-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            status: terminalTurnStatus(params.turn?.status),
          })
        }
      }
      if (event.method === 'thread/settings/updated') {
        const threadId = threadIdFromParams(params)
        if (threadId) {
          ctx.events.emit({
            type: 'thread-settings-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            settings: {
              model: params.threadSettings?.model ?? null,
              effort: params.threadSettings?.effort ?? null,
              approvalPolicy: params.threadSettings?.approvalPolicy ?? null,
            },
          })
        }
      }
      if (event.method === 'thread/tokenUsage/updated') {
        const threadId = threadIdFromParams(params)
        const tokenUsage = normalizeTokenUsage(params.tokenUsage)
        if (threadId && tokenUsage) {
          ctx.events.emit({
            type: 'thread-token-usage-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            tokenUsage,
          })
        }
      }

      const targetThreadId = threadIdFromParams(params) ?? event.threadId
      if (!targetThreadId) {
        return
      }
      const threadId = String(targetThreadId)

      if (event.method === 'item/started') {
        ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
      }
      if ((event.method === 'item/started' || event.method === 'item/completed') && params.item) {
        ctx.events.emit({
          type: 'history-item-upsert',
          hostId: event.hostId,
          threadId,
          item: {
            ...params.item,
            turnId: params.turnId,
          },
        })
      } else if (event.method === 'item/agentMessage/delta') {
        ctx.events.emit({ type: 'history-agent-delta', hostId: event.hostId, threadId, params })
      } else if (event.method === 'item/plan/delta') {
        ctx.events.emit({ type: 'history-plan-delta', hostId: event.hostId, threadId, params })
      } else if (event.method === 'item/reasoning/summaryTextDelta') {
        ctx.events.emit({ type: 'history-reasoning-summary-delta', hostId: event.hostId, threadId, params })
      } else if (event.method === 'item/reasoning/textDelta') {
        ctx.events.emit({ type: 'history-reasoning-text-delta', hostId: event.hostId, threadId, params })
      } else if (event.method === 'item/commandExecution/outputDelta') {
        ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
        ctx.events.emit({ type: 'history-item-output-delta', hostId: event.hostId, threadId, params, itemType: 'commandExecution' })
      } else if (event.method === 'item/fileChange/outputDelta') {
        ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
        ctx.events.emit({ type: 'history-item-output-delta', hostId: event.hostId, threadId, params, itemType: 'fileChange' })
      } else if (event.method === 'item/fileChange/patchUpdated') {
        ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
        ctx.events.emit({
          type: 'history-item-upsert',
          hostId: event.hostId,
          threadId,
          item: {
            type: 'fileChange',
            id: params.itemId,
            turnId: params.turnId,
            changes: params.changes ?? [],
            status: 'inProgress',
          },
        })
      } else if (event.method === 'turn/diff/updated') {
        ctx.events.emit({ type: 'history-turn-diff-updated', hostId: event.hostId, threadId, params })
      } else if (event.method === 'turn/plan/updated') {
        ctx.events.emit({
          type: 'history-item-upsert',
          hostId: event.hostId,
          threadId,
          item: {
            type: 'turnPlan',
            id: `${params.turnId}-plan`,
            turnId: params.turnId,
            explanation: params.explanation ?? null,
            plan: Array.isArray(params.plan) ? params.plan : [],
          },
        })
      } else if (event.method === 'turn/started' && params.turn) {
        ctx.events.emit({ type: 'history-turn-appended', hostId: event.hostId, threadId, turn: params.turn })
      } else if (event.method === 'turn/completed' && params.turn) {
        ctx.events.emit({ type: 'history-turn-synced', hostId: event.hostId, threadId, turn: params.turn })
      }
    },
  }
}

export function normalizeTokenUsage(value: any): ThreadTokenUsageState | null {
  const total = normalizeTokenBreakdown(value?.total)
  const last = normalizeTokenBreakdown(value?.last)
  if (!total || !last) {
    return null
  }
  const modelContextWindow = numberOrNull(value?.modelContextWindow)
  return {
    total,
    last,
    modelContextWindow,
  }
}

function normalizeTokenBreakdown(value: any) {
  const totalTokens = numberOrNull(value?.totalTokens)
  const inputTokens = numberOrNull(value?.inputTokens)
  const cachedInputTokens = numberOrNull(value?.cachedInputTokens)
  const outputTokens = numberOrNull(value?.outputTokens)
  const reasoningOutputTokens = numberOrNull(value?.reasoningOutputTokens)
  if ([totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens].some((item) => item == null)) {
    return null
  }
  return {
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  }
}

function numberOrNull(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}
