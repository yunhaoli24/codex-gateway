import type { GatewayEvent } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import type { GatewayEventHandlerRegistry } from "./types";

export const deltaEventHandlers: GatewayEventHandlerRegistry = {
  "item/agentMessage/delta": (ctx, event, params, threadId) => {
    ctx.events.emit("history-agent-delta", { hostId: event.hostId, threadId, params });
  },
  "item/plan/delta": (ctx, event, params, threadId) => {
    ctx.events.emit("history-plan-delta", { hostId: event.hostId, threadId, params });
  },
  "item/reasoning/summaryTextDelta": (ctx, event, params, threadId) => {
    ctx.events.emit("history-reasoning-summary-delta", {
      hostId: event.hostId,
      threadId,
      params,
    });
  },
  "item/reasoning/textDelta": (ctx, event, params, threadId) => {
    ctx.events.emit("history-reasoning-text-delta", {
      hostId: event.hostId,
      threadId,
      params,
    });
  },
  "item/commandExecution/outputDelta": (ctx, event, params, threadId) => {
    emitOutputDelta(ctx, event, params, threadId, "commandExecution");
  },
  "item/fileChange/outputDelta": (ctx, event, params, threadId) => {
    emitOutputDelta(ctx, event, params, threadId, "fileChange");
  },
};

function emitOutputDelta(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: Record<string, any>,
  threadId: string,
  itemType: "commandExecution" | "fileChange",
) {
  ctx.events.emit("thread-status-detected", {
    hostId: event.hostId,
    threadId,
    status: "running",
    turnId: params.turnId ? String(params.turnId) : null,
  });
  ctx.events.emit("history-item-output-delta", {
    hostId: event.hostId,
    threadId,
    params,
    itemType,
  });
}
