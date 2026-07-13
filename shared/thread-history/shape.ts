import type { ThreadHistoryState, ThreadHistoryTurn } from "./types";

export function threadTurnsFromHistory(history: unknown): ThreadHistoryTurn[] {
  if (!history || typeof history !== "object") return [];
  const record = history as Record<string, unknown>;
  const thread =
    record.thread && typeof record.thread === "object"
      ? (record.thread as Record<string, unknown>)
      : record;
  return Array.isArray(thread.turns) ? (thread.turns as ThreadHistoryTurn[]) : [];
}

export function ensureHistoryThread(history: unknown, currentThread: unknown, threadId: string) {
  const historyRecord =
    history && typeof history === "object" ? (history as Record<string, unknown>) : null;
  const existingThread =
    (historyRecord?.thread && typeof historyRecord.thread === "object"
      ? (historyRecord.thread as Record<string, unknown>)
      : null) ||
    (currentThread && typeof currentThread === "object"
      ? (currentThread as Record<string, unknown>)
      : {});
  const thread = {
    ...existingThread,
    id: existingThread.id || threadId,
    turns: Array.isArray(existingThread.turns)
      ? ([...existingThread.turns] as ThreadHistoryTurn[])
      : [],
  };
  return { thread } as ThreadHistoryState;
}
