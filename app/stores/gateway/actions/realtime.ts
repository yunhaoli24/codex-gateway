import type { GatewayEvent } from '~~/shared/types'
import type { GatewayStoreContext, ThreadRuntimeStatus } from '../types'
import {
  isThreadActiveStatus,
  pinnedKey,
  statusAfterThreadIdle,
  terminalTurnStatus,
  threadIdFromParams,
} from '../thread-utils'

export function createRealtimeActions(ctx: GatewayStoreContext) {
  return {
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

    connectEvents() {
      ctx.state.eventSource?.close()
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return
      }

      const url = `/api/events/${ctx.state.selectedHostId}/${encodeURIComponent(ctx.state.selectedThreadId)}?afterId=${ctx.state.lastEventId}`
      ctx.state.eventSource = new EventSource(url)
      ctx.state.eventSource.onmessage = (message) => {
        const event = JSON.parse(message.data) as GatewayEvent
        if (event.id <= ctx.state.lastEventId) {
          return
        }
        ctx.state.lastEventId = event.id
        ctx.state.events.push(event)
        if (ctx.state.events.length > 500) {
          ctx.state.events.shift()
        }
        ctx.applyLiveEvent(event)
      }
      ctx.state.eventSource.onerror = () => {
        ctx.setError('SSE connection interrupted. The browser will retry automatically.')
      }
    },

    applyLiveEvent(event: GatewayEvent) {
      const payload = event.payload as any
      const params = payload?.params || {}
      if (event.method === 'thread/status/changed') {
        const threadId = threadIdFromParams(params) || event.threadId
        if (threadId && event.hostId) {
          const key = pinnedKey(event.hostId, String(threadId))
          ctx.events.emit({
            type: 'thread-status-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            status: isThreadActiveStatus(params.status) ? 'running' : statusAfterThreadIdle(ctx.state.threadStatuses[key]),
          })
        }
      } else if (event.method === 'turn/started') {
        const threadId = threadIdFromParams(params) || event.threadId || ctx.state.selectedThreadId
        if (threadId && event.hostId) {
          ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId: String(threadId), status: 'running' })
        }
      } else if (event.method === 'turn/completed') {
        const threadId = threadIdFromParams(params) || event.threadId || ctx.state.selectedThreadId
        if (threadId && event.hostId) {
          ctx.events.emit({
            type: 'thread-status-detected',
            hostId: event.hostId,
            threadId: String(threadId),
            status: terminalTurnStatus(params.turn?.status),
          })
        }
      }
      if (event.method === 'thread/settings/updated') {
        const threadId = threadIdFromParams(params) || event.threadId
        if (threadId && event.hostId) {
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

      if (!ctx.state.selectedThreadId) {
        return
      }
      if (params.threadId && String(params.threadId) !== ctx.state.selectedThreadId) {
        return
      }

      if ((event.method === 'item/started' || event.method === 'item/completed') && params.item) {
        ctx.events.emit({
          type: 'history-item-upsert',
          threadId: ctx.state.selectedThreadId,
          item: {
            ...params.item,
            turnId: params.turnId,
          },
        })
      } else if (event.method === 'item/agentMessage/delta') {
        ctx.events.emit({ type: 'history-agent-delta', threadId: ctx.state.selectedThreadId, params })
      } else if (event.method === 'item/commandExecution/outputDelta') {
        ctx.events.emit({ type: 'history-item-output-delta', threadId: ctx.state.selectedThreadId, params, fallbackType: 'commandExecution' })
      } else if (event.method === 'item/fileChange/outputDelta') {
        ctx.events.emit({ type: 'history-item-output-delta', threadId: ctx.state.selectedThreadId, params, fallbackType: 'fileChange' })
      } else if (event.method === 'item/fileChange/patchUpdated') {
        ctx.events.emit({
          type: 'history-item-upsert',
          threadId: ctx.state.selectedThreadId,
          item: {
            type: 'fileChange',
            id: params.itemId,
            turnId: params.turnId,
            changes: params.changes ?? [],
            status: 'inProgress',
          },
        })
      } else if (event.method === 'turn/diff/updated') {
        ctx.events.emit({ type: 'history-turn-diff-updated', threadId: ctx.state.selectedThreadId, params })
      } else if (event.method === 'turn/started' && params.turn) {
        ctx.events.emit({ type: 'history-turn-appended', threadId: ctx.state.selectedThreadId, turn: params.turn })
      } else if (event.method === 'turn/completed' && params.turn) {
        ctx.events.emit({ type: 'history-turn-synced', threadId: ctx.state.selectedThreadId, turn: params.turn })
      }
    },
  }
}
