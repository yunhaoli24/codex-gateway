import type { GatewayEvent } from '~~/shared/types'
import { isThreadServerRequestMethod, itemTypeForServerRequest } from '~~/shared/server-requests'
import { normalizeTokenUsage } from '~~/shared/token-usage'
import type { GatewayStoreContext } from '../types'
import {
  runtimeStatusFromAppThreadStatus,
  terminalTurnStatus,
  threadIdFromParams,
} from '../thread-utils'

type AppServerEventParams = Record<string, any>
type GatewayEventHandler = (ctx: GatewayStoreContext, event: GatewayEvent, params: AppServerEventParams, threadId: string) => void

const appServerEventHandlers: Record<string, GatewayEventHandler> = {
  'thread/status/changed': (ctx, event, params) => {
    const threadId = threadIdFromParams(params)
    if (threadId) {
      ctx.events.emit({
        type: 'thread-status-detected',
        hostId: event.hostId,
        threadId: String(threadId),
        status: runtimeStatusFromAppThreadStatus(params.status),
      })
    }
  },
  'turn/started': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
    if (params.turn) {
      ctx.events.emit({ type: 'history-turn-appended', hostId: event.hostId, threadId, turn: params.turn })
    }
  },
  'turn/completed': (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: 'thread-status-detected',
      hostId: event.hostId,
      threadId,
      status: terminalTurnStatus(params.turn?.status),
    })
    if (params.turn) {
      ctx.events.emit({ type: 'history-turn-synced', hostId: event.hostId, threadId, turn: params.turn })
    }
  },
  'thread/settings/updated': (ctx, event, params) => {
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
  },
  'thread/tokenUsage/updated': (ctx, event, params) => {
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
  },
  'item/started': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
    upsertStartedOrCompletedItem(ctx, event, params, threadId, 'started')
  },
  'item/completed': (ctx, event, params, threadId) => {
    upsertStartedOrCompletedItem(ctx, event, params, threadId, 'completed')
  },
  'item/commandExecution/requestApproval': (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: 'history-item-upsert',
      hostId: event.hostId,
      threadId,
      item: {
        type: 'commandExecution',
        id: params.itemId,
        turnId: params.turnId,
        status: 'waitingForApproval',
        command: params.command,
        cwd: params.cwd,
        pendingApproval: {
          requestId: event.payload.id,
          method: event.method,
          params,
        },
      },
    })
  },
  'item/fileChange/requestApproval': (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: 'history-item-upsert',
      hostId: event.hostId,
      threadId,
      item: {
        type: 'fileChange',
        id: params.itemId,
        turnId: params.turnId,
        status: 'waitingForApproval',
        pendingApproval: {
          requestId: event.payload.id,
          method: event.method,
          params,
        },
      },
    })
  },
  'serverRequest/resolved': (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: 'history-server-request-resolved',
      hostId: event.hostId,
      threadId,
      requestId: params.requestId,
    })
  },
  'currentTime/read': () => {
    // Answered by the shared gateway RPC connection before browser event routing.
  },
  'item/agentMessage/delta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'history-agent-delta', hostId: event.hostId, threadId, params })
  },
  'item/plan/delta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'history-plan-delta', hostId: event.hostId, threadId, params })
  },
  'item/reasoning/summaryTextDelta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'history-reasoning-summary-delta', hostId: event.hostId, threadId, params })
  },
  'item/reasoning/textDelta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'history-reasoning-text-delta', hostId: event.hostId, threadId, params })
  },
  'item/commandExecution/outputDelta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
    ctx.events.emit({ type: 'history-item-output-delta', hostId: event.hostId, threadId, params, itemType: 'commandExecution' })
  },
  'item/fileChange/outputDelta': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'thread-status-detected', hostId: event.hostId, threadId, status: 'running' })
    ctx.events.emit({ type: 'history-item-output-delta', hostId: event.hostId, threadId, params, itemType: 'fileChange' })
  },
  'item/fileChange/patchUpdated': (ctx, event, params, threadId) => {
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
  },
  'turn/diff/updated': (ctx, event, params, threadId) => {
    ctx.events.emit({ type: 'history-turn-diff-updated', hostId: event.hostId, threadId, params })
  },
  'turn/plan/updated': (ctx, event, params, threadId) => {
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
  },
}

export function applyAppServerEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  const payload = event.payload as any
  const params = payload?.params || {}
  const targetThreadId = threadIdFromParams(params) ?? event.threadId
  if (!targetThreadId) {
    return
  }
  const threadId = String(targetThreadId)
  const handler = appServerEventHandlers[event.method]
  if (handler) {
    handler(ctx, event, params, threadId)
    return
  }
  if (payload?.id !== undefined && isThreadServerRequestMethod(event.method)) {
    ctx.events.emit({
      type: 'history-item-upsert',
      hostId: event.hostId,
      threadId,
      item: {
        type: itemTypeForServerRequest(event.method),
        id: `server-request-${String(payload.id)}`,
        turnId: params.turnId || `server-request-turn-${String(payload.id)}`,
        status: 'waitingForClient',
        requestId: payload.id,
        method: event.method,
        params,
      },
    })
  }
}

function upsertStartedOrCompletedItem(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
  phase: 'started' | 'completed',
) {
  if (!params.item) {
    return
  }
  const nowIso = new Date().toISOString()
  ctx.events.emit({
    type: 'history-item-upsert',
    hostId: event.hostId,
    threadId,
    item: {
      ...params.item,
      turnId: params.turnId,
      status: params.item.status ?? (phase === 'started' ? 'inProgress' : 'completed'),
      ...(phase === 'started' && !params.item.startedAt ? { startedAt: nowIso } : {}),
      ...(phase === 'completed' && !params.item.completedAt ? { completedAt: nowIso } : {}),
    },
  })
}
