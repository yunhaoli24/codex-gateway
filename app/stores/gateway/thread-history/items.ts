import { findTurnForItem, isClientOnlyItem, sameItem, turnId } from "./item-identity";
import { mergeThreadItem } from "./item-merge";
import { ensureHistoryThread } from "./shape";

export function mergeItemIntoLatestTurn(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  item: any,
) {
  if (!item || typeof item !== "object") {
    return history;
  }
  const itemTurnId = item.turnId ? String(item.turnId) : "";
  if (!itemTurnId && !isClientOnlyItem(item)) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const existing = findTurnForItem(turns, item);
  if (existing) {
    existing.turn.items = [...existing.turn.items];
    existing.turn.items[existing.itemIndex] = mergeThreadItem(
      existing.turn.items[existing.itemIndex],
      item,
    );
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }

  const clientTurnId = isClientOnlyItem(item) ? `client-${item.clientId}` : "";
  const targetTurnId = itemTurnId || clientTurnId;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === targetTurnId);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: targetTurnId, items: [], status: statusForNewTurn(item) };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  } else {
    turn.items = [...turn.items];
  }

  const index = turn.items.findIndex((candidate: any) => sameItem(candidate, item));
  if (index >= 0) {
    turn.items[index] = mergeThreadItem(turn.items[index], item);
  } else {
    turn.items.push(item);
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

function statusForNewTurn(item: any) {
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
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turnIdValue: string,
  item: any,
) {
  if (!item || typeof item !== "object" || !turnIdValue) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  }

  const existing = findTurnForItem(turns, item);
  if (existing) {
    existing.turn.items = [...existing.turn.items];
    existing.turn.items[existing.itemIndex] = mergeThreadItem(
      existing.turn.items[existing.itemIndex],
      item,
    );
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }

  turn = { ...turn, items: [...turn.items, item] };
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
