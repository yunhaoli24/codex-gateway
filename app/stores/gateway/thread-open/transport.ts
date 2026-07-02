import type { ComposerTurnOptions, ThreadOpenResult } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayStoreContext } from "../types";
import { sendRealtimeRequest } from "../realtime/request-response";

export type ThreadSnapshotMessage = Extract<
  import("~~/shared/types").RealtimeServerMessage,
  { type: "thread.snapshot" }
>;

export function requestActivateThreadSnapshot(
  ctx: GatewayStoreContext,
  input: {
    hostId: number;
    projectId: number | null;
    threadId: string;
    limit?: number;
  },
) {
  return sendRealtimeRequest<ThreadSnapshotMessage>(
    ctx,
    (requestId) => ({
      type: "thread.activate",
      requestId,
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
      limit: input.limit ?? INITIAL_TURN_PAGE_LIMIT,
    }),
    30_000,
  );
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
