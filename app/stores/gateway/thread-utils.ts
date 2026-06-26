import type { ThreadSettingsState } from '~~/shared/types'
import type { ThreadRuntimeStatus } from './types'

export function messageFromError(error: any, fallback: string) {
  return error?.data?.message
    || error?.data?.statusMessage
    || error?.statusMessage
    || error?.message
    || fallback
}

export function pinnedKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`
}

export function selectedThreadKey(hostId: number | null, threadId: string | null) {
  return hostId && threadId ? pinnedKey(hostId, threadId) : null
}

export function threadIdFromParams(params: any) {
  return params?.threadId || params?.thread_id || params?.turn?.threadId || params?.turn?.thread_id
}

export function isThreadActiveStatus(status: any) {
  const value = typeof status === 'string' ? status : status?.type
  return value === 'active' || value === 'inProgress' || value === 'running'
}

export function terminalTurnStatus(status: any): ThreadRuntimeStatus {
  const value = typeof status === 'string' ? status : status?.type
  if (value === 'failed') return 'failed'
  if (value === 'interrupted') return 'interrupted'
  return 'completed'
}

export function normalizeThreadSettings(settings: ThreadSettingsState | null | undefined): ThreadSettingsState {
  return {
    model: settings?.model || null,
    effort: settings?.effort || null,
    approvalPolicy: settings?.approvalPolicy === 'untrusted' || settings?.approvalPolicy === 'on-request' || settings?.approvalPolicy === 'never'
      ? settings.approvalPolicy
      : null,
  }
}

export function mergeThreadSettings(current: ThreadSettingsState, next: ThreadSettingsState): ThreadSettingsState {
  return {
    model: 'model' in next ? next.model ?? null : current.model ?? null,
    effort: 'effort' in next ? next.effort ?? null : current.effort ?? null,
    approvalPolicy: 'approvalPolicy' in next ? next.approvalPolicy ?? null : current.approvalPolicy ?? null,
  }
}

export function statusAfterThreadIdle(current: ThreadRuntimeStatus | undefined): ThreadRuntimeStatus {
  if (!current) return 'idle'
  if (current === 'running') return 'completed'
  return current
}

export function titleForThread(thread: any) {
  return thread?.name || thread?.preview || thread?.id || 'Untitled'
}

export function sortThreads(threads: any[]) {
  return [...threads].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1
    }
    return Number(right.recencyAt || right.updatedAt || 0) - Number(left.recencyAt || left.updatedAt || 0)
  })
}

function ensureHistoryThread(history: unknown, currentThread: unknown, threadId: string) {
  const historyRecord = (history && typeof history === 'object' ? history as Record<string, any> : null)
  const existingThread = historyRecord?.thread || (currentThread && typeof currentThread === 'object' ? currentThread as Record<string, any> : {})
  const thread = {
    ...existingThread,
    id: existingThread?.id || threadId,
    turns: Array.isArray(existingThread?.turns) ? [...existingThread.turns] : [],
  }
  return { thread }
}

export function mergeThreadTurns(history: unknown, currentThread: unknown, threadId: string, turns: any[], direction: 'prepend' | 'append') {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const existingTurns = nextHistory.thread.turns
  const seen = new Set(existingTurns.map((turn: any) => turn?.id).filter(Boolean).map(String))
  const incoming = turns.filter((turn: any) => {
    if (!turn?.id) {
      return true
    }
    const id = String(turn.id)
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
  nextHistory.thread.turns = direction === 'prepend'
    ? [...incoming, ...existingTurns]
    : [...existingTurns, ...incoming]
  return nextHistory
}

function itemId(item: any) {
  return item?.id ? String(item.id) : ''
}

function itemClientId(item: any) {
  return item?.clientId ? String(item.clientId) : ''
}

function sameItem(left: any, right: any) {
  const leftId = itemId(left)
  const rightId = itemId(right)
  if (leftId && rightId && leftId === rightId) {
    return true
  }

  const leftClientId = itemClientId(left)
  const rightClientId = itemClientId(right)
  return Boolean(leftClientId && rightClientId && leftClientId === rightClientId)
}

function findTurnForItem(turns: any[], item: any) {
  for (const turn of turns) {
    if (!Array.isArray(turn?.items)) {
      continue
    }
    const itemIndex = turn.items.findIndex((candidate: any) => sameItem(candidate, item))
    if (itemIndex >= 0) {
      return { turn, itemIndex }
    }
  }
  return null
}

export function mergeItemIntoLatestTurn(history: unknown, currentThread: unknown, threadId: string, item: any) {
  if (!item || typeof item !== 'object') {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  const existing = findTurnForItem(turns, item)
  if (existing) {
    existing.turn.items = [...existing.turn.items]
    existing.turn.items[existing.itemIndex] = { ...existing.turn.items[existing.itemIndex], ...item }
    nextHistory.thread.turns = [...turns]
    return nextHistory
  }

  let turnIndex = item.turnId ? turns.findIndex((candidate: any) => candidate?.id === item.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: item.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => sameItem(candidate, item))
  if (index >= 0) {
    turn.items[index] = { ...turn.items[index], ...item }
  } else {
    turn.items.push(item)
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

export function appendAgentDelta(history: unknown, currentThread: unknown, threadId: string, params: any) {
  const itemIdValue = params?.itemId ? String(params.itemId) : ''
  const delta = params?.delta || ''
  if (!itemIdValue || !delta) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turnIndex = params.turnId ? turns.findIndex((candidate: any) => candidate?.id === params.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: params.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue)
  if (index >= 0) {
    const item = turn.items[index]
    turn.items[index] = { ...item, text: `${item.text || ''}${delta}` }
  } else {
    turn.items.push({
      type: 'agentMessage',
      id: itemIdValue,
      text: delta,
      phase: 'final_answer',
    })
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

export function appendItemOutputDelta(history: unknown, currentThread: unknown, threadId: string, params: any, fallbackType: string) {
  const itemIdValue = params?.itemId ? String(params.itemId) : ''
  const delta = params?.delta || ''
  if (!itemIdValue || !delta) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turnIndex = params.turnId ? turns.findIndex((candidate: any) => candidate?.id === params.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: params.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue)
  if (index >= 0) {
    const item = turn.items[index]
    turn.items[index] = { ...item, aggregatedOutput: `${item.aggregatedOutput || ''}${delta}` }
  } else {
    turn.items.push({
      type: fallbackType,
      id: itemIdValue,
      turnId: params.turnId,
      status: 'inProgress',
      aggregatedOutput: delta,
    })
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

export function updateTurnDiff(history: unknown, currentThread: unknown, threadId: string, params: any) {
  if (!params?.turnId || typeof params.diff !== 'string') {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turn = turns.find((candidate: any) => candidate?.id === params.turnId)
  if (!turn) {
    turn = { id: params.turnId, items: [], status: 'inProgress' }
    turns.push(turn)
  }
  turn.diff = params.diff
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

export function syncCompletedTurn(history: unknown, currentThread: unknown, threadId: string, turn: any) {
  if (!turn?.id) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  const index = turns.findIndex((candidate: any) => candidate?.id === turn.id)
  if (index >= 0) {
    turns[index] = {
      ...turns[index],
      ...turn,
      items: Array.isArray(turn.items) && turn.items.length ? turn.items : turns[index].items,
    }
  } else {
    turns.push(turn)
  }
  nextHistory.thread.turns = [...turns]
  return nextHistory
}
