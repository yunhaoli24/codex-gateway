import { itemTypeForServerRequest } from "~~/shared/server-requests";
import type { GatewayEventHandlerRegistry } from "./types";

export const requestEventHandlers: GatewayEventHandlerRegistry = {
  "serverRequest/resolved": (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: "history-server-request-resolved",
      hostId: event.hostId,
      threadId,
      requestId: params.requestId,
    });
  },
  "currentTime/read": () => {
    // Answered by the shared gateway RPC connection before browser event routing.
  },
};

export function upsertUnhandledServerRequest(
  ctx: Parameters<GatewayEventHandlerRegistry[string]>[0],
  event: Parameters<GatewayEventHandlerRegistry[string]>[1],
  params: Record<string, any>,
  threadId: string,
) {
  ctx.events.emit({
    type: "history-item-upsert",
    hostId: event.hostId,
    threadId,
    item: {
      type: itemTypeForServerRequest(event.method),
      id: `server-request-${String(event.payload.id)}`,
      turnId: params.turnId || `server-request-turn-${String(event.payload.id)}`,
      status: "waitingForClient",
      requestId: event.payload.id,
      method: event.method,
      params,
    },
  });
}
