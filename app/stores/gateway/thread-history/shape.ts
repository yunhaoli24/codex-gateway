export function ensureHistoryThread(history: unknown, currentThread: unknown, threadId: string) {
  const historyRecord =
    history && typeof history === "object" ? (history as Record<string, any>) : null;
  const existingThread =
    historyRecord?.thread ||
    (currentThread && typeof currentThread === "object"
      ? (currentThread as Record<string, any>)
      : {});
  const thread = {
    ...existingThread,
    id: existingThread?.id || threadId,
    turns: Array.isArray(existingThread?.turns) ? [...existingThread.turns] : [],
  };
  return { thread };
}
