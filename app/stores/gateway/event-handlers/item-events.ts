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
    emitTerminalProcessCompleted(ctx, event, params, threadId);
    emitRemoteFilesChanged(ctx, event, params, threadId);
  },
  "item/commandExecution/requestApproval": (ctx, event, params, threadId) => {
    ctx.events.emit("history-item-upsert", {
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
    ctx.events.emit("history-item-upsert", {
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
    ctx.events.emit("history-item-upsert", {
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
  ctx.events.emit("thread-status-detected", {
    hostId: event.hostId,
    threadId,
    status: "running",
    turnId: params.turnId ? String(params.turnId) : null,
  });
}

function emitTerminalProcessCompleted(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
) {
  const item = params.item;
  if (item?.type !== "commandExecution" || !params.turnId || !item.id) {
    return;
  }
  ctx.events.emit("terminal-process-completed", {
    hostId: event.hostId,
    threadId,
    turnId: String(params.turnId),
    itemId: String(item.id),
  });
}

function emitRemoteFilesChanged(
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
) {
  if (params.item?.type !== "fileChange") {
    return;
  }
  const paths = (Array.isArray(params.item.changes) ? params.item.changes : [])
    .map((change: Record<string, unknown>) => change.path ?? change.filePath)
    .filter((path: unknown): path is string => typeof path === "string" && path.length > 0);
  if (paths.length) {
    ctx.events.emit("remote-files-changed", { hostId: event.hostId, threadId, paths });
  }
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
  const eventIso = event.createdAt || new Date().toISOString();
  ctx.events.emit("history-item-upsert", {
    hostId: event.hostId,
    threadId,
    item: {
      ...params.item,
      turnId: params.turnId,
      status: params.item.status ?? (phase === "started" ? "inProgress" : "completed"),
      ...(phase === "started" && !params.item.startedAt ? { startedAt: eventIso } : {}),
      ...(phase === "completed" && !params.item.completedAt ? { completedAt: eventIso } : {}),
    },
  });
}
