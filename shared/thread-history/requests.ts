import { ensureHistoryThread } from "./shape";
import type {
  ThreadHistoryItem,
  ThreadHistorySeed,
  ThreadHistoryState,
  ThreadHistoryTurn,
} from "./types";

export function resolveServerRequestInHistory(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  requestIdValue: string | number,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const requestId = String(requestIdValue);
  if (!requestId) {
    return nextHistory;
  }
  nextHistory.thread.turns = nextHistory.thread.turns.map((turn: ThreadHistoryTurn) => {
    if (!Array.isArray(turn?.items)) {
      return turn;
    }
    let turnChanged = false;
    const items = turn.items.map((item) => {
      const pendingApprovalRequestId = String(item.pendingApproval?.requestId ?? "");
      const itemRequestId = String(item.requestId ?? "");
      if (pendingApprovalRequestId !== requestId && itemRequestId !== requestId) {
        return item;
      }
      turnChanged = true;
      return resolveServerRequestItem(item, itemRequestId === requestId);
    });
    return turnChanged ? { ...turn, items } : turn;
  });
  return nextHistory;
}

function resolveServerRequestItem(item: ThreadHistoryItem, isStandaloneRequest: boolean) {
  const { pendingApproval: _pendingApproval, requestId: _requestId, ...rest } = item;
  // A human command is a review checkpoint, never a command execution. Resolving it means
  // only that the approval was handled (including rejection/cancellation), not that it ran.
  if (_pendingApproval?.params?.kind === "humanCommand") return { ...rest, status: "resolved" };
  if (!isStandaloneRequest) {
    return rest;
  }
  return {
    ...rest,
    status: "completed",
  };
}
