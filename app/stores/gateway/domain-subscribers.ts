import type { GatewayStoreContext } from './types'
import {
  appendAgentDelta,
  appendItemOutputDelta,
  mergeItemIntoLatestTurn,
  mergeThreadTurns,
  syncCompletedTurn,
  updateTurnDiff,
} from './thread-utils'

export function registerGatewayDomainSubscribers(ctx: GatewayStoreContext) {
  ctx.events.on('thread-status-detected', (event) => {
    ctx.setThreadStatus(event.hostId, event.threadId, event.status)
  })
  ctx.events.on('thread-settings-detected', (event) => {
    ctx.setThreadSettings(event.hostId, event.threadId, event.settings)
  })
  ctx.events.on('history-item-upsert', (event) => {
    ctx.state.history = mergeItemIntoLatestTurn(ctx.state.history, ctx.state.currentThread, event.threadId, event.item)
  })
  ctx.events.on('history-agent-delta', (event) => {
    ctx.state.history = appendAgentDelta(ctx.state.history, ctx.state.currentThread, event.threadId, event.params)
  })
  ctx.events.on('history-item-output-delta', (event) => {
    ctx.state.history = appendItemOutputDelta(ctx.state.history, ctx.state.currentThread, event.threadId, event.params, event.fallbackType)
  })
  ctx.events.on('history-turn-diff-updated', (event) => {
    ctx.state.history = updateTurnDiff(ctx.state.history, ctx.state.currentThread, event.threadId, event.params)
  })
  ctx.events.on('history-turn-appended', (event) => {
    ctx.state.history = mergeThreadTurns(ctx.state.history, ctx.state.currentThread, event.threadId, [event.turn], 'append')
  })
  ctx.events.on('history-turn-synced', (event) => {
    ctx.state.history = syncCompletedTurn(ctx.state.history, ctx.state.currentThread, event.threadId, event.turn)
  })
}
