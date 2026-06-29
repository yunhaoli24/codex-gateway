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
  const handler = appServerEventHandlers[event.method];
  if (handler) {
    handler(ctx, event, params, threadId);
    return;
  }
  if (payload?.id !== undefined && isThreadServerRequestMethod(event.method)) {
    upsertUnhandledServerRequest(ctx, event, params, threadId);
  }
}
