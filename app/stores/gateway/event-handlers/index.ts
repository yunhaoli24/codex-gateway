import type { GatewayEvent } from "~~/shared/types";
import { isThreadServerRequestMethod } from "~~/shared/server-requests";
import type { GatewayStoreContext } from "../types";
import { threadIdFromParams } from "../thread-utils/identity";
import { appServerEventHandlers } from "./registry";
import { upsertUnhandledServerRequest } from "./request-events";

export function applyAppServerEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  const payload = event.payload as any;
  const params = payload?.params || {};
  const targetThreadId = threadIdFromParams(params) ?? event.threadId;
  if (!targetThreadId) {
    return;
  }

  const threadId = String(targetThreadId);
  clearRecoveredTransientError(ctx, event, params, threadId);
  const handler = appServerEventHandlers[event.method];
  if (handler) {
    handler(ctx, event, params, threadId);
    return;
  }
  if (payload?.id !== undefined && isThreadServerRequestMethod(event.method)) {
    upsertUnhandledServerRequest(ctx, event, params, threadId);
  }
}

function clearRecoveredTransientError(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: Record<string, any>,
  threadId: string,
) {
  const current = ctx.state.error;
  if (!current?.transient || event.method === "error") {
    return;
  }
  const eventTurnId = turnIdFromParams(params);
  if (!eventTurnId || current.turnId !== eventTurnId) {
    return;
  }
  if (current.hostId !== event.hostId || current.threadId !== threadId) {
    return;
  }
  // app-server willRetry errors are temporary stream retry notices. Any later
  // event for the same turn proves the retry recovered, so the banner is stale.
  ctx.clearError();
}

function turnIdFromParams(params: Record<string, any>) {
  const value = params.turnId ?? params.turn?.id;
  return typeof value === "string" ? value : value == null ? null : String(value);
}
