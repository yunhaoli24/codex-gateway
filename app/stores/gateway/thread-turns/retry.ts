import type { ComposerTurnOptions } from "~~/shared/types";
import {
  AppServerTurnDisplayError,
  isServerOverloadedAppError,
  isServerOverloadedRequestError,
} from "../errors";
import { emitNotificationItem } from "../event-handlers/notification-item";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, SubmittedTurnRequestState } from "../types";
import { createClientUserMessageId } from "./turn-content";
import { requestTurnStart, requestTurnSteer } from "./turn-transport";

const MAX_SERVER_OVERLOADED_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 500;

type SubmittedTurnRequestInput = {
  kind: SubmittedTurnRequestState["kind"];
  hostId: number;
  projectId: number | null;
  threadId: string;
  cwd: string | null;
  text: string;
  options: ComposerTurnOptions;
};

export function rememberSubmittedTurnRequest(
  ctx: GatewayStoreContext,
  input: SubmittedTurnRequestInput,
) {
  const key = pinnedKey(input.hostId, input.threadId);
  const existing = ctx.state.submittedTurnRequestsByKey[key];
  if (existing?.retryTimer) {
    clearTimeout(existing.retryTimer);
  }
  ctx.state.submittedTurnRequestsByKey = {
    ...ctx.state.submittedTurnRequestsByKey,
    [key]: {
      ...input,
      retryCount: 0,
      pendingRetryTurnId: null,
      retryTimer: null,
    },
  };
}

export function clearSubmittedTurnRequest(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
) {
  const key = pinnedKey(hostId, threadId);
  const existing = ctx.state.submittedTurnRequestsByKey[key];
  if (existing?.retryTimer) {
    clearTimeout(existing.retryTimer);
  }
  const { [key]: _removed, ...remaining } = ctx.state.submittedTurnRequestsByKey;
  ctx.state.submittedTurnRequestsByKey = remaining;
}

export async function runTurnRequestWithAutoRetry<T>(
  ctx: GatewayStoreContext,
  request: SubmittedTurnRequestInput,
  execute: () => Promise<T>,
) {
  rememberSubmittedTurnRequest(ctx, request);
  try {
    return await execute();
  } catch (error) {
    return handleImmediateOverloadRetry(ctx, request, error, execute);
  }
}

export function maybeQueueServerOverloadedRetry(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  turnId: string,
  error: AppServerTurnDisplayError,
) {
  if (!isServerOverloadedAppError(error) || error.willRetry) {
    return false;
  }
  const key = pinnedKey(hostId, threadId);
  const request = ctx.state.submittedTurnRequestsByKey[key];
  if (!request) {
    return false;
  }
  if (request.pendingRetryTurnId === turnId) {
    return true;
  }
  if (request.retryCount >= MAX_SERVER_OVERLOADED_RETRIES) {
    clearSubmittedTurnRequest(ctx, hostId, threadId);
    ctx.setError(buildRetryExhaustedMessage(ctx, error, request.retryCount), {
      hostId,
      projectId: request.projectId,
      threadId,
    });
    return true;
  }
  ctx.state.submittedTurnRequestsByKey = {
    ...ctx.state.submittedTurnRequestsByKey,
    [key]: {
      ...request,
      pendingRetryTurnId: turnId,
    },
  };
  const attempt = request.retryCount + 1;
  const message = buildRetryingMessage(ctx, attempt);
  ctx.setError(message, {
    hostId,
    projectId: request.projectId,
    threadId,
  });
  emitRetryNotification(ctx, hostId, threadId, turnId, attempt);
  return true;
}

export function maybeRetryAfterTurnFailure(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  turn: Record<string, any>,
) {
  const turnId = typeof turn?.id === "string" ? turn.id : String(turn?.id ?? "");
  if (!turnId) {
    return;
  }
  const key = pinnedKey(hostId, threadId);
  const request = ctx.state.submittedTurnRequestsByKey[key];
  if (!request) {
    return;
  }
  if (request.pendingRetryTurnId !== turnId) {
    if (isTerminalTurnStatus(turn?.status)) {
      clearSubmittedTurnRequest(ctx, hostId, threadId);
    }
    return;
  }
  if (turn?.status !== "failed") {
    clearSubmittedTurnRequest(ctx, hostId, threadId);
    return;
  }
  void scheduleRetry(ctx, request);
}

function isTerminalTurnStatus(status: unknown) {
  return status === "completed" || status === "failed" || status === "interrupted";
}

async function handleImmediateOverloadRetry<T>(
  ctx: GatewayStoreContext,
  request: SubmittedTurnRequestInput,
  error: any,
  execute: () => Promise<T>,
) {
  if (!isServerOverloadedRequestError(error)) {
    clearSubmittedTurnRequest(ctx, request.hostId, request.threadId);
    throw error;
  }
  for (let attempt = 1; attempt <= MAX_SERVER_OVERLOADED_RETRIES; attempt += 1) {
    updateStoredRetryState(ctx, request.hostId, request.threadId, {
      retryCount: attempt,
      pendingRetryTurnId: null,
    });
    const message = buildRetryingMessage(ctx, attempt);
    ctx.setError(message, {
      hostId: request.hostId,
      projectId: request.projectId,
      threadId: request.threadId,
    });
    await wait(delayForRetry(attempt));
    try {
      const result = await execute();
      updateStoredRetryState(ctx, request.hostId, request.threadId, {
        retryCount: attempt,
        pendingRetryTurnId: null,
      });
      return result;
    } catch (nextError) {
      if (!isServerOverloadedRequestError(nextError)) {
        clearSubmittedTurnRequest(ctx, request.hostId, request.threadId);
        throw nextError;
      }
      if (attempt === MAX_SERVER_OVERLOADED_RETRIES) {
        clearSubmittedTurnRequest(ctx, request.hostId, request.threadId);
        throw nextError;
      }
    }
  }
  throw error;
}

async function scheduleRetry(ctx: GatewayStoreContext, request: SubmittedTurnRequestState) {
  const attempt = request.retryCount + 1;
  if (attempt > MAX_SERVER_OVERLOADED_RETRIES) {
    clearSubmittedTurnRequest(ctx, request.hostId, request.threadId);
    return;
  }
  const delay = delayForRetry(attempt);
  const key = pinnedKey(request.hostId, request.threadId);
  const timer = window.setTimeout(() => {
    void retryStoredTurnRequest(ctx, key);
  }, delay);
  ctx.state.submittedTurnRequestsByKey = {
    ...ctx.state.submittedTurnRequestsByKey,
    [key]: {
      ...request,
      retryCount: attempt,
      retryTimer: timer,
    },
  };
}

async function retryStoredTurnRequest(ctx: GatewayStoreContext, key: string) {
  const request = ctx.state.submittedTurnRequestsByKey[key];
  if (!request) {
    return;
  }
  updateStoredRetryState(ctx, request.hostId, request.threadId, {
    retryTimer: null,
    pendingRetryTurnId: null,
  });
  ctx.setThreadStatus(request.hostId, request.threadId, "running");
  clearThreadScopedError(ctx, request.hostId, request.threadId);
  try {
    if (request.kind === "start") {
      await requestTurnStart(ctx, {
        hostId: request.hostId,
        threadId: request.threadId,
        text: request.text,
        clientUserMessageId: createClientUserMessageId("turn"),
        cwd: request.cwd,
        options: request.options,
      });
      return;
    }
    const activeTurnId = ctx.state.activeTurnIdsByThreadKey[key];
    if (!activeTurnId) {
      throw new Error(ctx.t("app.sendSteerFailed"));
    }
    await requestTurnSteer(ctx, {
      hostId: request.hostId,
      threadId: request.threadId,
      expectedTurnId: activeTurnId,
      text: request.text,
      clientUserMessageId: createClientUserMessageId("steer"),
      options: request.options,
    });
  } catch (error) {
    if (
      isServerOverloadedRequestError(error) &&
      request.retryCount < MAX_SERVER_OVERLOADED_RETRIES
    ) {
      const message = buildRetryingMessage(ctx, request.retryCount + 1);
      ctx.setError(message, {
        hostId: request.hostId,
        projectId: request.projectId,
        threadId: request.threadId,
      });
      await scheduleRetry(ctx, {
        ...request,
        retryTimer: null,
      });
      return;
    }
    clearSubmittedTurnRequest(ctx, request.hostId, request.threadId);
    ctx.setError(messageFromRetryFailure(ctx, request, error), {
      hostId: request.hostId,
      projectId: request.projectId,
      threadId: request.threadId,
    });
  }
}

function updateStoredRetryState(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  patch: Partial<SubmittedTurnRequestState>,
) {
  const key = pinnedKey(hostId, threadId);
  const current = ctx.state.submittedTurnRequestsByKey[key];
  if (!current) {
    return;
  }
  ctx.state.submittedTurnRequestsByKey = {
    ...ctx.state.submittedTurnRequestsByKey,
    [key]: {
      ...current,
      ...patch,
    },
  };
}

function delayForRetry(attempt: number) {
  return RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
}

function buildRetryingMessage(ctx: GatewayStoreContext, attempt: number) {
  return ctx.t("app.appServerAutoRetrying", {
    attempt,
    max: MAX_SERVER_OVERLOADED_RETRIES,
  });
}

function buildRetryExhaustedMessage(
  ctx: GatewayStoreContext,
  error: AppServerTurnDisplayError,
  retries: number,
) {
  return [ctx.t("app.appServerAutoRetryExhausted", { max: retries }), error.toDisplayMessage()]
    .filter(Boolean)
    .join("\n");
}

function emitRetryNotification(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  turnId: string,
  attempt: number,
) {
  emitNotificationItem(ctx, hostId, threadId, {
    id: `gateway-auto-retry-${threadId}-${turnId}-${attempt}`,
    turnId,
    method: "gateway/autoRetry",
    title: ctx.t("app.appServerAutoRetryTitle"),
    level: "warning",
    message: buildRetryingMessage(ctx, attempt),
  });
}

function messageFromRetryFailure(
  ctx: GatewayStoreContext,
  request: SubmittedTurnRequestState,
  error: any,
) {
  const message =
    error?.data?.message ||
    error?.response?._data?.message ||
    error?.message ||
    (request.kind === "steer" ? ctx.t("app.sendSteerFailed") : ctx.t("app.sendMessageFailed"));
  if (request.retryCount < MAX_SERVER_OVERLOADED_RETRIES) {
    return message;
  }
  return [ctx.t("app.appServerAutoRetryExhausted", { max: MAX_SERVER_OVERLOADED_RETRIES }), message]
    .filter(Boolean)
    .join("\n");
}

function wait(delay: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

function clearThreadScopedError(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const current = ctx.state.error;
  if (!current) {
    return;
  }
  if (current.hostId !== hostId || current.threadId !== threadId) {
    return;
  }
  ctx.clearError();
}
