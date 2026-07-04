import { ensureHistoryThread } from "./shape";
import type { ThreadHistoryTurn, ThreadServerRequestItem } from "./types";

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
  nextHistory.thread.turns = nextHistory.thread.turns.map((turn: ThreadHistoryTurn) => {
    if (!Array.isArray(turn?.items)) {
      return turn;
    }
    let turnChanged = false;
    const items = turn.items.map((item) => {
      const requestItem = item as ThreadServerRequestItem;
      const pendingApprovalRequestId = String(requestItem.pendingApproval?.requestId ?? "");
      const itemRequestId = String(requestItem.requestId ?? "");
      if (pendingApprovalRequestId !== requestId && itemRequestId !== requestId) {
        return item;
      }
      turnChanged = true;
      changed = true;
      return resolveServerRequestItem(requestItem, itemRequestId === requestId);
    });
    return turnChanged ? { ...turn, items } : turn;
  });
  return changed ? nextHistory : history;
}

function resolveServerRequestItem(item: ThreadServerRequestItem, isStandaloneRequest: boolean) {
  const { pendingApproval: _pendingApproval, requestId: _requestId, ...rest } = item;
  if (!isStandaloneRequest) {
    return rest;
  }
  return {
    ...rest,
    status: "completed",
  };
}
