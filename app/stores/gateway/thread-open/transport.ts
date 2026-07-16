import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";

export type ThreadSnapshotMessage = Extract<
  import("~~/shared/types").RealtimeServerMessage,
  { type: "thread.snapshot" }
>;

export type ThreadStartedMessage = Extract<
  import("~~/shared/types").RealtimeServerMessage,
  { type: "thread.started" }
>;

export function requestActivateThreadSnapshot(input: {
  hostId: number;
  projectId: number | null;
  threadId: string;
  limit?: number;
}) {
  return useGatewayRealtimeStore().request<ThreadSnapshotMessage>(
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

export function requestStartThread(options: ComposerTurnOptions) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  if (!navigation.selectedHostId) throw new Error("Host is required to start a thread");
  return useGatewayRealtimeStore().request<ThreadStartedMessage>(
    (requestId) => ({
      type: "thread.start",
      requestId,
      hostId: navigation.selectedHostId!,
      projectId: navigation.selectedProjectId,
      cwd: gateway.selectedProject?.remotePath,
      model: options.model || undefined,
      effort: options.effort || undefined,
      approvalPolicy: options.approvalPolicy || undefined,
    }),
    30_000,
  );
}
