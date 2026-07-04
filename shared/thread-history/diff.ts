import { ensureHistoryThread } from "./shape";

export function updateTurnDiff(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: Record<string, unknown>,
) {
  if (!params?.turnId || typeof params.diff !== "string") {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const turn = turns.find((candidate) => candidate?.id === params.turnId);
  if (!turn) {
    return history;
  }
  turn.diff = params.diff;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
