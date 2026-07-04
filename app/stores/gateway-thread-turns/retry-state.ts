import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import type { SubmittedTurnRequestState } from "@/stores/gateway-thread-turns";

export function pendingTurnRequest(hostId: number, threadId: string) {
  return useGatewayThreadTurnsStore().requestForThread(hostId, threadId);
}

export function markPendingRetryTurn(hostId: number, threadId: string, turnId: string) {
  useGatewayThreadTurnsStore().patchRequest(hostId, threadId, { pendingRetryTurnId: turnId });
}

export function updateRetryAttempt(
  request: Pick<SubmittedTurnRequestState, "hostId" | "threadId">,
  attempt: number,
) {
  useGatewayThreadTurnsStore().patchRequest(request.hostId, request.threadId, {
    retryCount: attempt,
    pendingRetryTurnId: null,
  });
}

export function storeRetryTimer(request: SubmittedTurnRequestState, retryTimer: number) {
  useGatewayThreadTurnsStore().patchRequest(request.hostId, request.threadId, {
    retryTimer,
    retryCount: request.retryCount + 1,
  });
}

export function clearPendingTurnRequest(hostId: number, threadId: string) {
  useGatewayThreadTurnsStore().clearRequest(hostId, threadId);
}

export function clearThreadScopedError(hostId: number, threadId: string) {
  const gateway = useGatewayStore();
  const current = gateway.error;
  if (!current || current.hostId !== hostId || current.threadId !== threadId) {
    return;
  }
  gateway.clearError();
}

export function isTerminalTurnStatus(status: unknown) {
  return status === "completed" || status === "failed" || status === "interrupted";
}
