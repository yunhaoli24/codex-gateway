import {
  isServerOverloadedRequestError,
  type AppServerTurnDisplayError,
} from "@/stores/gateway/errors";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import type {
  SubmittedTurnRequestInput,
  SubmittedTurnRequestState,
} from "@/stores/gateway-thread-turns";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { createClientUserMessageId } from "@/stores/gateway/thread-turns/turn-content";
import { requestTurnStart, requestTurnSteer } from "./transport";
import { MAX_SERVER_OVERLOADED_RETRIES, type Translate } from "./types";
import {
  buildRetryExhaustedMessage,
  buildRetryingMessage,
  messageFromRetryFailure,
} from "./retry-messages";
import { upsertHistoryItem } from "./history";
import { createRetryTimer, waitForRetry } from "./retry-scheduler";
import {
  clearPendingTurnRequest,
  clearThreadScopedError,
  isTerminalTurnStatus,
  markPendingRetryTurn,
  pendingTurnRequest,
  storeRetryTimer,
  updateRetryAttempt,
} from "./retry-state";

export async function runTurnRequestWithAutoRetry<T>(
  t: Translate,
  request: SubmittedTurnRequestInput,
  execute: () => Promise<T>,
) {
  const store = useGatewayThreadTurnsStore();
  store.rememberRequest(request);
  try {
    return await execute();
  } catch (error) {
    return handleImmediateOverloadRetry(t, request, error, execute);
  }
}

export function queueServerOverloadedRetryNotice(
  t: Translate,
  hostId: number,
  threadId: string,
  turnId: string,
  error: AppServerTurnDisplayError,
) {
  const request = pendingTurnRequest(hostId, threadId);
  if (!request) {
    return false;
  }
  if (request.pendingRetryTurnId === turnId) {
    return true;
  }
  if (request.retryCount >= MAX_SERVER_OVERLOADED_RETRIES) {
    clearPendingTurnRequest(hostId, threadId);
    useGatewayStore().setError(buildRetryExhaustedMessage(t, error, request.retryCount), {
      hostId,
      projectId: request.projectId,
      threadId,
    });
    return true;
  }
  markPendingRetryTurn(hostId, threadId, turnId);
  showRetryNotice(t, request, turnId, request.retryCount + 1);
  return true;
}

export function retryAfterFailedTurn(
  t: Translate,
  hostId: number,
  threadId: string,
  turn: Record<string, unknown>,
) {
  const turnId = typeof turn.id === "string" || typeof turn.id === "number" ? String(turn.id) : "";
  if (!turnId) {
    return;
  }
  const request = pendingTurnRequest(hostId, threadId);
  if (!request) {
    return;
  }
  if (request.pendingRetryTurnId !== turnId) {
    if (isTerminalTurnStatus(turn?.status)) {
      clearPendingTurnRequest(hostId, threadId);
    }
    return;
  }
  if (turn?.status !== "failed") {
    clearPendingTurnRequest(hostId, threadId);
    return;
  }
  scheduleStoredTurnRetry(t, request);
}

async function handleImmediateOverloadRetry<T>(
  t: Translate,
  request: SubmittedTurnRequestInput,
  error: unknown,
  execute: () => Promise<T>,
) {
  if (!isServerOverloadedRequestError(error)) {
    clearPendingTurnRequest(request.hostId, request.threadId);
    throw error;
  }
  for (let attempt = 1; attempt <= MAX_SERVER_OVERLOADED_RETRIES; attempt += 1) {
    updateRetryAttempt(request, attempt);
    setThreadRetryError(t, request, attempt);
    await waitForRetry(attempt);
    try {
      const result = await execute();
      updateRetryAttempt(request, attempt);
      return result;
    } catch (nextError) {
      if (!isServerOverloadedRequestError(nextError)) {
        clearPendingTurnRequest(request.hostId, request.threadId);
        throw nextError;
      }
      if (attempt === MAX_SERVER_OVERLOADED_RETRIES) {
        clearPendingTurnRequest(request.hostId, request.threadId);
        throw nextError;
      }
    }
  }
  throw error;
}

function scheduleStoredTurnRetry(t: Translate, request: SubmittedTurnRequestState) {
  const retryTimer = createRetryTimer(request.retryCount + 1, () => {
    void retryStoredTurnRequest(t, request.hostId, request.threadId);
  });
  storeRetryTimer(request, retryTimer);
}

async function retryStoredTurnRequest(t: Translate, hostId: number, threadId: string) {
  const request = pendingTurnRequest(hostId, threadId);
  if (!request) {
    return;
  }
  useGatewayThreadTurnsStore().patchRequest(hostId, threadId, {
    retryTimer: null,
    pendingRetryTurnId: null,
  });
  useGatewayThreadRuntimeStore().setThreadStatus(hostId, threadId, "running");
  clearThreadScopedError(hostId, threadId);
  try {
    await executeStoredTurnRequest(t, request);
  } catch (error) {
    handleRetryFailure(t, request, error);
  }
}

async function executeStoredTurnRequest(t: Translate, request: SubmittedTurnRequestState) {
  if (request.kind === "start") {
    await requestTurnStart({
      hostId: request.hostId,
      threadId: request.threadId,
      text: request.text,
      clientUserMessageId: createClientUserMessageId("turn"),
      cwd: request.cwd,
      options: request.options,
    });
    return;
  }
  const activeTurnId = useGatewayThreadRuntimeStore().threadRuntimeProjection(
    request.hostId,
    request.threadId,
  ).activeTurnId;
  if (!activeTurnId) {
    throw new Error(t("app.sendSteerFailed"));
  }
  await requestTurnSteer({
    hostId: request.hostId,
    threadId: request.threadId,
    expectedTurnId: activeTurnId,
    text: request.text,
    clientUserMessageId: createClientUserMessageId("steer"),
    options: request.options,
  });
}

function handleRetryFailure(t: Translate, request: SubmittedTurnRequestState, error: unknown) {
  if (isServerOverloadedRequestError(error) && request.retryCount < MAX_SERVER_OVERLOADED_RETRIES) {
    setThreadRetryError(t, request, request.retryCount + 1);
    scheduleStoredTurnRetry(t, { ...request, retryTimer: null });
    return;
  }
  clearPendingTurnRequest(request.hostId, request.threadId);
  useGatewayStore().setError(messageFromRetryFailure(t, request, error), {
    hostId: request.hostId,
    projectId: request.projectId,
    threadId: request.threadId,
  });
}

function setThreadRetryError(t: Translate, request: SubmittedTurnRequestInput, attempt: number) {
  useGatewayStore().setError(buildRetryingMessage(t, attempt), {
    hostId: request.hostId,
    projectId: request.projectId,
    threadId: request.threadId,
  });
}

function showRetryNotice(
  t: Translate,
  request: SubmittedTurnRequestState,
  turnId: string,
  attempt: number,
) {
  setThreadRetryError(t, request, attempt);
  upsertRetryHistoryItem(t, request.hostId, request.threadId, turnId, attempt);
}

function upsertRetryHistoryItem(
  t: Translate,
  hostId: number,
  threadId: string,
  turnId: string,
  attempt: number,
) {
  upsertHistoryItem(hostId, threadId, {
    type: "notification",
    id: `retry-${turnId}-${attempt}`,
    turnId,
    method: "gateway/autoRetry",
    level: "warning",
    title: t("app.appServerAutoRetryTitle"),
    message: buildRetryingMessage(t, attempt),
  });
}
