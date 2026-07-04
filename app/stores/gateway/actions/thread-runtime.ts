import type { ThreadTokenUsageState } from "~~/shared/types";
import { applyThreadRuntimeStatus } from "../thread-runtime/projector";
import { projectThreadRuntime } from "../thread-runtime/projector";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, ThreadRuntimeStatus, ThreadStatusUpdateOptions } from "../types";

export function createThreadRuntimeActions(ctx: GatewayStoreContext) {
  return {
    setThreadRunning(hostId: number, threadId: string, running: boolean) {
      applyThreadRuntimeStatus(ctx, hostId, threadId, {
        status: running ? "running" : "completed",
      });
    },

    setThreadStatus(
      hostId: number,
      threadId: string,
      status: ThreadRuntimeStatus,
      options: ThreadStatusUpdateOptions = {},
    ) {
      applyThreadRuntimeStatus(ctx, hostId, threadId, {
        status,
        turnId: options.turnId,
      });
    },

    setThreadTokenUsage(hostId: number, threadId: string, tokenUsage: ThreadTokenUsageState) {
      ctx.state.threadTokenUsageByKey = {
        ...ctx.state.threadTokenUsageByKey,
        [pinnedKey(hostId, threadId)]: tokenUsage,
      };
    },

    threadRuntimeProjection(hostId: number, threadId: string) {
      return projectThreadRuntime(ctx, hostId, threadId);
    },
  };
}
