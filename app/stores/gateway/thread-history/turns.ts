import { mergeTurnItems } from "./item-merge";
import { ensureHistoryThread } from "./shape";
import { terminalTurnStatus } from "../thread-utils/status";

export function mergeThreadTurns(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turns: any[],
  direction: "prepend" | "append",
) {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const existingTurns = nextHistory.thread.turns;
  const seen = new Set(
    existingTurns
      .map((turn: any) => turn?.id)
      .filter(Boolean)
      .map(String),
  );
  const incoming = turns.filter((turn: any) => {
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
  turn: any,
) {
  if (!turn?.id) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const syncedTurn = { ...turn, status: terminalTurnStatus(turn.status) };
  const index = turns.findIndex((candidate: any) => candidate?.id === turn.id);
  if (index >= 0) {
    const existingItems = Array.isArray(turns[index].items) ? turns[index].items : [];
    const incomingItems = Array.isArray(syncedTurn.items) ? syncedTurn.items : [];
    turns[index] = {
      ...turns[index],
      ...syncedTurn,
      items: mergeTurnItems(existingItems, incomingItems),
    };
  } else {
    turns.push(syncedTurn);
  }
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
