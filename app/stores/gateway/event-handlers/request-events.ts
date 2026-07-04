import { itemTypeForServerRequest, SERVER_REQUEST_ITEM_TYPES } from "~~/shared/server-requests";
import type { GatewayEventHandlerRegistry } from "./types";

const pendingServerRequestHandlers = Object.fromEntries(
  Object.keys(SERVER_REQUEST_ITEM_TYPES).map((method) => [method, upsertPendingServerRequest]),
) satisfies GatewayEventHandlerRegistry;

export const requestEventHandlers: GatewayEventHandlerRegistry = {
  ...pendingServerRequestHandlers,
  "serverRequest/resolved": (ctx, event, params, threadId) => {
    ctx.events.emit("history-server-request-resolved", {
      hostId: event.hostId,
      threadId,
      requestId: params.requestId,
    });
  },
  "currentTime/read": () => {
    // Answered by the shared gateway RPC connection before browser event routing.
  },
};

function upsertPendingServerRequest(
  ctx: Parameters<GatewayEventHandlerRegistry[string]>[0],
  event: Parameters<GatewayEventHandlerRegistry[string]>[1],
  params: Record<string, any>,
  threadId: string,
) {
  ctx.events.emit("history-item-upsert", {
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
