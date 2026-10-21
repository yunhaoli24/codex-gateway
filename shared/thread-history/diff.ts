import { ensureHistoryThread } from "./shape";
import type { ThreadHistorySeed, ThreadHistoryState } from "./types";

export function updateTurnDiff(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  params: Record<string, unknown>,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turnId =
    typeof params.turnId === "string" || typeof params.turnId === "number" ? params.turnId : null;
  if (turnId === null || typeof params.diff !== "string") {
    return nextHistory;
  }
  const turns = nextHistory.thread.turns;
  const index = turns.findIndex((candidate) => candidate.id === turnId);
  const turn = turns[index];
  if (turn === undefined) {
    return nextHistory;
  }
  turns[index] = { ...turn, diff: params.diff };
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
