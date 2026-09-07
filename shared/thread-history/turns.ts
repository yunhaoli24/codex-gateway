import { mergeTurnItems } from "./item-merge";
import { ensureHistoryThread } from "./shape";
import { terminalTurnStatus } from "../thread-runtime-status";
import type { ThreadHistorySeed, ThreadHistoryState, ThreadHistoryTurn } from "./types";

export function mergeThreadTurns(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  turns: ThreadHistoryTurn[],
  direction: "prepend" | "append",
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const existingTurns = nextHistory.thread.turns;
  const seen = new Set(
    existingTurns
      .map((turn) => turn.id)
      .filter((id): id is string | number => typeof id === "string" || typeof id === "number")
      .map((id) => String(id)),
  );
  const incoming = turns.filter((turn) => {
    if (typeof turn.id !== "string" && typeof turn.id !== "number") {
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
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  turn: ThreadHistoryTurn,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  if (typeof turn.id !== "string" && typeof turn.id !== "number") {
    return nextHistory;
  }
  const turns = nextHistory.thread.turns;
  const syncedTurn = { ...turn, status: terminalTurnStatus(turn.status) };
  const index = turns.findIndex((candidate) => candidate?.id === turn.id);
  if (index >= 0) {
    const existingTurn = turns[index];
    if (!existingTurn) {
      return nextHistory;
    }
    const existingItems = existingTurn.items ?? [];
    const incomingItems = syncedTurn.items ?? [];
    turns[index] = {
      ...existingTurn,
      ...syncedTurn,
      // A lifecycle notification describes its own payload, not our accumulated history.
      // turn/completed carries only a summary (or no items), including for legacy threads.
      // Never downgrade a full page we already loaded; conversely, receiving live items alone
      // does not prove completeness when a client subscribed halfway through a turn.
      itemsView: existingTurn.itemsView === "full" ? "full" : syncedTurn.itemsView,
      items: mergeTurnItems(existingItems, incomingItems),
    };
  } else {
    turns.push(syncedTurn);
  }
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
