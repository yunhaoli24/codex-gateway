import {
  isServerOverloadedAppError,
  type AppServerTurnDisplayError,
} from "@/stores/gateway/errors";
import type { SubmittedTurnRequestInput } from "@/stores/gateway-thread-turns";
import type { Translate } from "./types";
import {
  queueServerOverloadedRetryNotice,
  retryAfterFailedTurn,
  runTurnRequestWithAutoRetry as runTurnRequestWithAutoRetryInternal,
} from "./retry-executor";

export async function runTurnRequestWithAutoRetry<T>(
  t: Translate,
  request: SubmittedTurnRequestInput,
  execute: () => Promise<T>,
) {
  return runTurnRequestWithAutoRetryInternal(t, request, execute);
}

export function maybeQueueServerOverloadedRetry(
  t: Translate,
  hostId: number,
  threadId: string,
  turnId: string,
  error: AppServerTurnDisplayError,
) {
  if (!isServerOverloadedAppError(error) || error.willRetry) {
    return false;
  }
  return queueServerOverloadedRetryNotice(t, hostId, threadId, turnId, error);
}

export function maybeRetryAfterTurnFailure(
  t: Translate,
  hostId: number,
  threadId: string,
  turn: Record<string, any>,
) {
  retryAfterFailedTurn(t, hostId, threadId, turn);
}
