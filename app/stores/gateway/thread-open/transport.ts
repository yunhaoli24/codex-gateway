import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TIMELINE_PAGE_LIMIT } from "~~/shared/config";
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

export interface ThreadSnapshotActivationInput {
  hostId: number;
  threadId: string;
  limit?: number;
  retryWriter?: boolean;
}

export function requestActivateThreadSnapshot(input: ThreadSnapshotActivationInput) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "thread.activate",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      limit: input.limit ?? INITIAL_TIMELINE_PAGE_LIMIT,
      retryWriter: input.retryWriter,
    }),
    expectThreadSnapshot,
    // History activation can replay a large official timeline page over SSH. The realtime store
    // owns the shared long-operation deadline so a browser request does not abandon the server
    // operation and create a second subscription on the next activation.
  );
}

export function requestStartThread(options: ComposerTurnOptions) {
  const navigation = useGatewayNavigationStore();
  const hostId = navigation.selectedHostId;
  if (hostId === null) throw new Error("Host is required to start a thread");
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "thread.start",
      requestId,
      hostId,
      cwd: navigation.selectedCwd,
      provider: options.provider,
      model: options.model === "" ? undefined : options.model,
      effort: options.effort === "" ? undefined : options.effort,
      summary: options.summary,
      approvalPolicy: options.approvalPolicy ?? undefined,
    }),
    expectThreadStarted,
    { timeoutMs: 30_000 },
  );
}
