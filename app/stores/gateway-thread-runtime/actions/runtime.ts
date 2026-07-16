import type { ThreadRuntimeStatus, ThreadTokenUsageState } from "~~/shared/types";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import type { ThreadStatusUpdateOptions } from "@/stores/gateway/types";
import {
  applyThreadRuntimeStatus,
  projectThreadRuntime,
} from "@/stores/gateway/thread-runtime/projector";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function createThreadRuntimeActions() {
  return {
    setThreadRunning(hostId: number, threadId: string, running: boolean) {
      applyThreadRuntimeStatus(hostId, threadId, {
        status: running ? "running" : "completed",
      });
    },
    setThreadStatus(
      hostId: number,
      threadId: string,
      status: ThreadRuntimeStatus,
      options: ThreadStatusUpdateOptions = {},
    ) {
      applyThreadRuntimeStatus(hostId, threadId, { status, turnId: options.turnId });
    },
    setThreadTokenUsage(hostId: number, threadId: string, tokenUsage: ThreadTokenUsageState) {
      const runtime = useGatewayThreadRuntimeStore();
      runtime.threadTokenUsageByKey = {
        ...runtime.threadTokenUsageByKey,
        [pinnedKey(hostId, threadId)]: tokenUsage,
      };
    },
    threadRuntimeProjection(hostId: number, threadId: string) {
      return projectThreadRuntime(hostId, threadId);
    },
  };
}
