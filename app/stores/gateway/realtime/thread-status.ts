import type { ThreadTokenUsageState } from "~~/shared/types";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, ThreadRuntimeStatus } from "../types";

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
) {
  const key = pinnedKey(hostId, threadId);
  const runningKeys = new Set(ctx.state.runningThreadKeys);
  ctx.state.threadStatuses = {
    ...ctx.state.threadStatuses,
    [key]: status,
  };
  if (status === "running") {
    runningKeys.add(key);
  } else {
    runningKeys.delete(key);
  }
  ctx.state.runningThreadKeys = [...runningKeys];
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
