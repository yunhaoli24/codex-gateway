import type { GatewayEvent, ThreadTokenUsageState } from '~~/shared/types'
import { toast } from 'vue-sonner'
import type { GatewayStoreContext, ThreadRuntimeStatus } from '../types'
import {
  pinnedKey,
  runtimeStatusFromAppThreadStatus,
  terminalTurnStatus,
  threadIdFromParams,
} from '../thread-utils'

export function createRealtimeActions(ctx: GatewayStoreContext) {
  return {
    connectHostLifecycleEvents() {
      if (!import.meta.client || ctx.state.hostLifecycleEventSource) {
        return
      }
      const eventSource = new EventSource('/api/hosts/events')
      ctx.state.hostLifecycleEventSource = eventSource
      const notified = new Set<string>()
      eventSource.onmessage = (message) => {
        const event = JSON.parse(message.data) as {
          hostId: number
          status: 'checkingVersion' | 'upgrading' | 'restarting' | 'connecting' | 'connected' | 'failed'
          message: string
          createdAt?: string
        }
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
        if ((event.status === 'upgrading' || event.status === 'restarting') && !notified.has(notifyKey)) {
          notified.add(notifyKey)
          toast.info(event.message)
        }
      }
      eventSource.onerror = () => {
        // EventSource reconnects automatically.
      }
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
      const existing = ctx.state.eventSources[key]
      if (existing && existing.readyState !== EventSource.CLOSED) {
        ctx.ensureEventSourceHealthCheck()
        return
      }
      if (existing) {
        const { [key]: _closed, ...eventSources } = ctx.state.eventSources
        ctx.state.eventSources = eventSources
      }
      const afterId = ctx.state.threadSnapshots[key]?.lastEventId ?? (
        hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId ? ctx.state.lastEventId : 0
      )
      const url = `/api/events/${hostId}/${encodeURIComponent(threadId)}?afterId=${afterId}`
      const eventSource = new EventSource(url)
      ctx.state.eventSources = {
        ...ctx.state.eventSources,
        [key]: eventSource,
      }
      ctx.state.eventSourceCreatedAt = {
        ...ctx.state.eventSourceCreatedAt,
        [key]: Date.now(),
      }
      ctx.ensureEventSourceHealthCheck()
      eventSource.onmessage = (message) => {
        const event = JSON.parse(message.data) as GatewayEvent
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
      }
      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          const { [key]: _closed, ...eventSources } = ctx.state.eventSources
          const { [key]: _closedCreatedAt, ...eventSourceCreatedAt } = ctx.state.eventSourceCreatedAt
          ctx.state.eventSources = eventSources
          ctx.state.eventSourceCreatedAt = eventSourceCreatedAt
          window.setTimeout(() => {
            ctx.connectEvents(hostId, threadId)
          }, 1000)
        }
      }
    },

    ensureEventSourceHealthCheck() {
      if (!import.meta.client || ctx.state.eventSourceHealthTimer) {
        return
      }
      ctx.state.eventSourceHealthTimer = window.setInterval(() => {
        for (const [key, eventSource] of Object.entries(ctx.state.eventSources)) {
          const age = Date.now() - (ctx.state.eventSourceCreatedAt[key] ?? 0)
          if (eventSource.readyState === EventSource.OPEN || (eventSource.readyState === EventSource.CONNECTING && age < 30_000)) {
            continue
          }
          const [hostIdRaw, threadId] = key.split(':')
          const hostId = Number(hostIdRaw)
          eventSource.close()
          const { [key]: _closed, ...eventSources } = ctx.state.eventSources
          const { [key]: _closedCreatedAt, ...eventSourceCreatedAt } = ctx.state.eventSourceCreatedAt
          ctx.state.eventSources = eventSources
          ctx.state.eventSourceCreatedAt = eventSourceCreatedAt
          if (Number.isInteger(hostId) && threadId) {
            ctx.connectEvents(hostId, threadId)
          }
        }
      }, 3_000)
    },

    closeThreadEvents(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId)
      ctx.state.eventSources[key]?.close()
      const { [key]: _closed, ...eventSources } = ctx.state.eventSources
      const { [key]: _closedCreatedAt, ...eventSourceCreatedAt } = ctx.state.eventSourceCreatedAt
      ctx.state.eventSources = eventSources
      ctx.state.eventSourceCreatedAt = eventSourceCreatedAt
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
