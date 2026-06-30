import type { ComposerTurnOptions, ThreadOpenResult } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayStoreContext } from "../types";

export function requestOpenThread(input: {
  hostId: number;
  projectId: number | null;
  threadId: string;
}) {
  return gatewayApi<ThreadOpenResult>("/api/threads/open", {
    method: "POST",
    body: {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
      limit: INITIAL_TURN_PAGE_LIMIT,
    },
  });
}

export function requestStartThread(ctx: GatewayStoreContext, options: ComposerTurnOptions) {
  return gatewayApi<ThreadOpenResult>("/api/threads/start", {
    method: "POST",
    body: {
      hostId: ctx.state.selectedHostId,
      projectId: ctx.state.selectedProjectId,
      cwd: ctx.selectedProject?.remotePath,
      model: options.model || undefined,
      effort: options.effort || undefined,
      approvalPolicy: options.approvalPolicy || undefined,
    },
  });
}
