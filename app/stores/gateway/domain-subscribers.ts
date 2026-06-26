import type { GatewayStoreContext } from './types'
import {
  appendAgentDelta,
  appendItemOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
  mergeItemIntoLatestTurn,
  mergeThreadTurns,
  syncCompletedTurn,
  updateTurnDiff,
  pinnedKey,
} from './thread-utils'

export function registerGatewayDomainSubscribers(ctx: GatewayStoreContext) {
  ctx.events.on('thread-status-detected', (event) => {
    ctx.setThreadStatus(event.hostId, event.threadId, event.status)
  })
  ctx.events.on('thread-settings-detected', (event) => {
    ctx.setThreadSettings(event.hostId, event.threadId, event.settings)
  })
  ctx.events.on('thread-token-usage-detected', (event) => {
    ctx.setThreadTokenUsage(event.hostId, event.threadId, event.tokenUsage)
  })
  ctx.events.on('history-item-upsert', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      mergeItemIntoLatestTurn(history, currentThread, event.threadId, event.item),
    )
  })
  ctx.events.on('history-agent-delta', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendAgentDelta(history, currentThread, event.threadId, event.params),
    )
  })
  ctx.events.on('history-plan-delta', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendPlanDelta(history, currentThread, event.threadId, event.params),
    )
  })
  ctx.events.on('history-reasoning-summary-delta', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningSummaryDelta(history, currentThread, event.threadId, event.params),
    )
  })
  ctx.events.on('history-reasoning-text-delta', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningTextDelta(history, currentThread, event.threadId, event.params),
    )
  })
  ctx.events.on('history-item-output-delta', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendItemOutputDelta(history, currentThread, event.threadId, event.params, event.itemType),
    )
  })
  ctx.events.on('history-turn-diff-updated', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      updateTurnDiff(history, currentThread, event.threadId, event.params),
    )
  })
  ctx.events.on('history-turn-appended', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      mergeThreadTurns(history, currentThread, event.threadId, [event.turn], 'append'),
    )
  })
  ctx.events.on('history-turn-synced', (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      syncCompletedTurn(history, currentThread, event.threadId, event.turn),
    )
  })
}

function updateThreadHistory(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  update: (history: unknown, currentThread: unknown) => unknown,
) {
  const isSelected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId
  if (isSelected) {
    ctx.state.history = update(ctx.state.history, ctx.state.currentThread)
    ctx.cacheSelectedThreadSnapshot()
    return
  }

  const key = pinnedKey(hostId, threadId)
  const snapshot = ctx.state.threadSnapshots[key]
  if (!snapshot) {
    return
  }
  ctx.state.threadSnapshots[key] = {
    ...snapshot,
    history: update(snapshot.history, snapshot.currentThread),
  }
}
