import { mergeTurnItems } from "./item-merge";
import { mergeEarlierTimelineItems } from "./item-page";
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
  const incoming = turns.filter(
    (turn) => typeof turn.id === "string" || typeof turn.id === "number",
  );
  const incomingIds = new Set(incoming.map((turn) => String(turn.id)));
  const mergedExisting = existingTurns.map((existing) => {
    if (!incomingIds.has(String(existing.id))) return existing;
    const incomingTurn = incoming.find((turn) => String(turn.id) === String(existing.id));
    if (incomingTurn === undefined) return existing;
    const existingItems = existing.items ?? [];
    const incomingItems = incomingTurn.items ?? [];
    return {
      ...existing,
      ...incomingTurn,
      itemsView: existing.itemsView === "full" ? "full" : incomingTurn.itemsView,
      // Activation sends a recent tail, whereas a reader may already have paged farther back.
      // An omitted continuation is not an instruction to forget that official cursor. Explicit
      // null still means the incoming page reached the beginning of the Turn.
      olderItemsCursor:
        incomingTurn.olderItemsCursor === undefined
          ? existing.olderItemsCursor
          : incomingTurn.olderItemsCursor,
      itemsPageEndId:
        incomingTurn.olderItemsCursor === undefined
          ? existing.itemsPageEndId
          : incomingTurn.itemsPageEndId,
      items:
        direction === "prepend"
          ? mergeEarlierTimelineItems(existingItems, incomingItems, existing.itemsPageEndId)
          : mergeTurnItems(existingItems, incomingItems),
    };
  });
  const newTurns = incoming.filter(
    (turn) => !existingTurns.some((existing) => String(existing.id) === String(turn.id)),
  );
  nextHistory.thread.turns =
    direction === "prepend" ? [...newTurns, ...mergedExisting] : [...mergedExisting, ...newTurns];
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
      // turn/completed carries only a summary (or no items), so it must not downgrade a full
      // timeline page already loaded by the Gateway.
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
