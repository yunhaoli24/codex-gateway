import { mergeTurnItems } from "./item-merge";
import { ensureHistoryThread } from "./shape";
import { terminalTurnStatus } from "../thread-runtime-status";
import type { ThreadHistoryItem, ThreadHistoryTurn } from "./types";

export function mergeThreadTurns(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turns: ThreadHistoryTurn[],
  direction: "prepend" | "append",
) {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const existingTurns = nextHistory.thread.turns;
  const seen = new Set(
    existingTurns
      .map((turn) => turn?.id)
      .filter(Boolean)
      .map(String),
  );
  const incoming = turns.filter((turn) => {
    if (!turn?.id) {
      return true;
    }
    const id = String(turn.id);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  nextHistory.thread.turns =
    direction === "prepend" ? [...incoming, ...existingTurns] : [...existingTurns, ...incoming];
  return nextHistory;
}

export function syncCompletedTurn(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turn: ThreadHistoryTurn,
) {
  if (!turn?.id) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const syncedTurn = { ...turn, status: terminalTurnStatus(turn.status) };
  const index = turns.findIndex((candidate) => candidate?.id === turn.id);
  if (index >= 0) {
    const existingTurn = turns[index];
    if (!existingTurn) {
      return history;
    }
    const existingItems = Array.isArray(existingTurn.items)
      ? (existingTurn.items as ThreadHistoryItem[])
      : [];
    const incomingItems = Array.isArray(syncedTurn.items)
      ? (syncedTurn.items as ThreadHistoryItem[])
      : [];
    turns[index] = {
      ...existingTurn,
      ...syncedTurn,
      items: mergeTurnItems(existingItems, incomingItems),
    };
  } else {
    turns.push(syncedTurn);
  }
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
