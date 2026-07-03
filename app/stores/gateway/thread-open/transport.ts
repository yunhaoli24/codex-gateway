import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { GatewayStoreContext } from "../types";
import { sendRealtimeRequest } from "../realtime/request-response";

export type ThreadSnapshotMessage = Extract<
  import("~~/shared/types").RealtimeServerMessage,
  { type: "thread.snapshot" }
>;

export type ThreadStartedMessage = Extract<
  import("~~/shared/types").RealtimeServerMessage,
  { type: "thread.started" }
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
  const hostId = ctx.state.selectedHostId;
  if (!hostId) {
    throw new Error("Host is required to start a thread");
  }
  return sendRealtimeRequest<ThreadStartedMessage>(
    ctx,
    (requestId) => ({
      type: "thread.start",
      requestId,
      hostId,
      projectId: ctx.state.selectedProjectId,
      cwd: ctx.selectedProject?.remotePath,
      model: options.model || undefined,
      effort: options.effort || undefined,
      approvalPolicy: options.approvalPolicy || undefined,
    }),
    30_000,
  );
}
