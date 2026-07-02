import type { ThreadTokenUsageState } from "~~/shared/types";
import { applyThreadRuntimeStatus } from "../thread-runtime/projector";
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
  applyThreadRuntimeStatus(ctx, hostId, threadId, {
    status,
    turnId: options.turnId,
  });
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
