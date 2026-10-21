import { findTurnForItem, sameItem, syntheticTurnIdForItem, turnId } from "./item-identity";
import { mergeThreadItem } from "./item-merge";
import { ensureHistoryThread } from "./shape";
import type { ThreadHistoryItem, ThreadHistorySeed, ThreadHistoryState } from "./types";

export function mergeItemIntoLatestTurn(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  item: ThreadHistoryItem,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const itemTurnId =
    typeof item.turnId === "string" || typeof item.turnId === "number" ? String(item.turnId) : "";
  const syntheticTurnId = syntheticTurnIdForItem(item);
  if (!itemTurnId && !syntheticTurnId) {
    return nextHistory;
  }
  const turns = nextHistory.thread.turns;
  const existing = findTurnForItem(turns, item);
  if (existing) {
    const existingItems = [...(existing.turn.items ?? [])];
    const existingItem = existingItems[existing.itemIndex];
    if (!existingItem) {
      return nextHistory;
    }
    const existingTurnId = turnId(existing.turn);
    if (!itemTurnId || existingTurnId === itemTurnId) {
      existingItems[existing.itemIndex] = mergeThreadItem(existingItem, item);
      turns[turns.indexOf(existing.turn)] = { ...existing.turn, items: existingItems };
      nextHistory.thread.turns = [...turns];
      return nextHistory;
    }

    // Optimistic sends live in a client-* Turn until app-server assigns the authoritative turnId.
    // Matching clientId proves both rows represent one user action, so move that item instead of
    // retaining a synthetic Turn beside the official Turn. This reconciliation belongs at the
    // item identity boundary: doing it in the composer would fix only the sending browser, while
    // accepted responses, realtime fan-out, and replay all converge through this reducer.
    item = mergeThreadItem(existingItem, item);
    existingItems.splice(existing.itemIndex, 1);
    const sourceIndex = turns.indexOf(existing.turn);
    if (existingItems.length === 0 && existingTurnId.startsWith("client-")) {
      turns.splice(sourceIndex, 1);
    } else {
      turns[sourceIndex] = { ...existing.turn, items: existingItems };
    }
  }

  const targetTurnId = itemTurnId || syntheticTurnId;
  let turnIndex = turns.findIndex((candidate) => turnId(candidate) === targetTurnId);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: targetTurnId, items: [], status: statusForNewTurn(item) };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return nextHistory;
  }
  // Preserve the prior Turn for incremental projection and other cached readers. Item upserts
  // must replace their owning Turn just like deltas/lifecycle reducers, never mutate it in place.
  const items = [...turn.items];
  turn = { ...turn, items };

  const index = items.findIndex((candidate) => sameItem(candidate, item));
  if (index >= 0) {
    const existingItem = items[index];
    if (existingItem) {
      items[index] = mergeThreadItem(existingItem, item);
    }
  } else {
    // App Server notification order is the timeline order. Presentation code may hide process
    // items behind the intermediate disclosure, but it must not move transcript items around.
    items.push(item);
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

function statusForNewTurn(item: ThreadHistoryItem) {
  const status = typeof item?.status === "string" ? item.status : item?.status?.type;
  return isActiveItemStatus(status) ? "inProgress" : "completed";
}

function isActiveItemStatus(status: unknown) {
  return (
    status === "inProgress" ||
    status === "running" ||
    status === "active" ||
    status === "waitingForClient" ||
    status === "waitingForApproval"
  );
}

export function insertSteerItemIntoActiveTurn(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  turnIdValue: string,
  item: ThreadHistoryItem,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  if (turnIdValue.length === 0) {
    return nextHistory;
  }
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return nextHistory;
  }

  const existing = findTurnForItem(turns, item);
  if (existing) {
    const existingItems = [...(existing.turn.items ?? [])];
    const existingItem = existingItems[existing.itemIndex];
    if (!existingItem) {
      return nextHistory;
    }
    existingItems[existing.itemIndex] = mergeThreadItem(existingItem, item);
    turns[turns.indexOf(existing.turn)] = { ...existing.turn, items: existingItems };
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }

  turn = { ...turn, items: [...turn.items, item] };
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
