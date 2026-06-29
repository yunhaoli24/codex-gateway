import type { ComposerTurnOptions, ThreadOpenResult } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

export function requestOpenThread(input: {
  hostId: number;
  projectId: number | null;
  threadId: string;
}) {
  return $fetch<ThreadOpenResult>("/api/threads/open", {
    method: "POST",
    body: {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
      limit: 20,
    },
  });
}

export function requestStartThread(ctx: GatewayStoreContext, options: ComposerTurnOptions) {
  return $fetch<ThreadOpenResult>("/api/threads/start", {
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
