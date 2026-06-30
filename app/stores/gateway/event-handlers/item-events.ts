import type { GatewayEvent } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { tagFileChanges } from "./file-change-sequence";
import type { AppServerEventParams, GatewayEventHandlerRegistry } from "./types";

export const itemEventHandlers: GatewayEventHandlerRegistry = {
  "item/started": (ctx, event, params, threadId) => {
    emitRunning(ctx, event, params, threadId);
    upsertStartedOrCompletedItem(ctx, event, params, threadId, "started");
  },
  "item/completed": (ctx, event, params, threadId) => {
    upsertStartedOrCompletedItem(ctx, event, params, threadId, "completed");
  },
  "item/commandExecution/requestApproval": (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: "history-item-upsert",
      hostId: event.hostId,
      threadId,
      item: {
        type: "commandExecution",
        id: params.itemId,
        turnId: params.turnId,
        status: "waitingForApproval",
        command: params.command,
        cwd: params.cwd,
        pendingApproval: {
          requestId: event.payload.id,
          method: event.method,
          params,
        },
      },
    });
  },
  "item/fileChange/requestApproval": (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: "history-item-upsert",
      hostId: event.hostId,
      threadId,
      item: {
        type: "fileChange",
        id: params.itemId,
        turnId: params.turnId,
        status: "waitingForApproval",
        pendingApproval: {
          requestId: event.payload.id,
          method: event.method,
          params,
        },
      },
    });
  },
  "item/fileChange/patchUpdated": (ctx, event, params, threadId) => {
    emitRunning(ctx, event, params, threadId);
    ctx.events.emit({
      type: "history-item-upsert",
      hostId: event.hostId,
      threadId,
      item: {
        type: "fileChange",
        id: params.itemId,
        turnId: params.turnId,
        changes: tagFileChanges(params.changes),
        status: "inProgress",
      },
    });
  },
};

function emitRunning(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
) {
  ctx.events.emit({
    type: "thread-status-detected",
    hostId: event.hostId,
    threadId,
    status: "running",
    turnId: params.turnId ? String(params.turnId) : null,
  });
}

function upsertStartedOrCompletedItem(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
  phase: "started" | "completed",
) {
  if (!params.item) {
    return;
  }
  const nowIso = new Date().toISOString();
  ctx.events.emit({
    type: "history-item-upsert",
    hostId: event.hostId,
    threadId,
    item: {
      ...params.item,
      turnId: params.turnId,
      status: params.item.status ?? (phase === "started" ? "inProgress" : "completed"),
      ...(phase === "started" && !params.item.startedAt ? { startedAt: nowIso } : {}),
      ...(phase === "completed" && !params.item.completedAt ? { completedAt: nowIso } : {}),
    },
  });
}
