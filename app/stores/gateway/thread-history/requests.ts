import { ensureHistoryThread } from "./shape";

export function resolveServerRequestInHistory(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  requestIdValue: string | number,
) {
  const requestId = String(requestIdValue);
  if (!requestId) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  let changed = false;
  nextHistory.thread.turns = nextHistory.thread.turns.map((turn: any) => {
    if (!Array.isArray(turn?.items)) {
      return turn;
    }
    let turnChanged = false;
    const items = turn.items.map((item: any) => {
      if (String(item?.pendingApproval?.requestId ?? "") !== requestId) {
        return item;
      }
      const { pendingApproval: _pendingApproval, ...rest } = item;
      turnChanged = true;
      changed = true;
      return rest;
    });
    return turnChanged ? { ...turn, items } : turn;
  });
  return changed ? nextHistory : history;
}
