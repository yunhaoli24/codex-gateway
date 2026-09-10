import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { projectById } from "@/stores/gateway-catalog/selectors";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import {
  expectThreadSnapshot,
  expectThreadStarted,
} from "@/stores/gateway-realtime/response-parsers";

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
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "thread.activate",
      requestId,
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
      limit: input.limit ?? INITIAL_TURN_PAGE_LIMIT,
    }),
    expectThreadSnapshot,
    // Legacy app-server rollouts can take longer than 30 seconds to replay even when the first
    // page contains only two Turns. Use the realtime broker's shared long-operation deadline,
    // which intentionally exceeds the backend RPC timeout. A shorter transport-specific timer
    // abandons the browser request while the server keeps loading and later attaches an orphaned
    // subscription, causing repeated opens to amplify the original slowdown.
  );
}

export function requestStartThread(options: ComposerTurnOptions) {
  const gateway = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const hostId = navigation.selectedHostId;
  if (hostId === null) throw new Error("Host is required to start a thread");
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "thread.start",
      requestId,
      hostId,
      projectId: navigation.selectedProjectId,
      cwd: projectById(gateway.projects, navigation.selectedProjectId)?.remotePath,
      provider: options.provider,
      model: options.model === "" ? undefined : options.model,
      effort: options.effort === "" ? undefined : options.effort,
      approvalPolicy: options.approvalPolicy ?? undefined,
    }),
    expectThreadStarted,
    { timeoutMs: 30_000 },
  );
}
