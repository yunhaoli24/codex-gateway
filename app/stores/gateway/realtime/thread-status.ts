import type { ThreadTokenUsageState } from "~~/shared/types";
import { notifyThreadTerminalStatus } from "../notifications/thread-terminal-notifications";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, ThreadRuntimeStatus, ThreadStatusUpdateOptions } from "../types";

export function setThreadRunning(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  running: boolean,
) {
  setThreadStatus(ctx, hostId, threadId, running ? "running" : "completed");
}

export function setThreadStatus(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  status: ThreadRuntimeStatus,
  options: ThreadStatusUpdateOptions = {},
) {
  const notifyTerminal = options.notifyTerminal ?? false;
  const key = pinnedKey(hostId, threadId);
  const previousStatus = ctx.state.threadStatuses[key] ?? "idle";
  const runningKeys = new Set(ctx.state.runningThreadKeys);
  ctx.state.threadStatuses = {
    ...ctx.state.threadStatuses,
    [key]: status,
  };
  if (options.turnId) {
    ctx.state.activeTurnIdsByThreadKey = {
      ...ctx.state.activeTurnIdsByThreadKey,
      [key]: options.turnId,
    };
  }
  if (status === "running") {
    runningKeys.add(key);
  } else {
    runningKeys.delete(key);
  }
  ctx.state.runningThreadKeys = [...runningKeys];
  if (status === "running") {
    return;
  }
  if (notifyTerminal && previousStatus === "running") {
    notifyThreadTerminalStatus(ctx, hostId, threadId, status, {
      turnId: options.turnId ?? ctx.state.activeTurnIdsByThreadKey[key] ?? null,
    });
  }
}

export function setThreadTokenUsage(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  tokenUsage: ThreadTokenUsageState,
) {
  ctx.state.threadTokenUsageByKey = {
    ...ctx.state.threadTokenUsageByKey,
    [pinnedKey(hostId, threadId)]: tokenUsage,
  };
}
