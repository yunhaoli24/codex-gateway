import type { AgentRpcClient } from "../agent/provider-adapter";
import type { ThreadGoalResolver, ThreadMetadataResolver } from "./thread-runtime-events";

const NOTIFICATION_INSPECTION_TIMEOUT_MS = 10_000;

export interface ThreadNotificationResolvers {
  resolveGoal: ThreadGoalResolver;
  resolveThread: ThreadMetadataResolver;
}

export function createThreadNotificationResolvers(
  client: AgentRpcClient,
  threadId: string,
): ThreadNotificationResolvers {
  return {
    // Notification enrichment is a bounded, concurrent read. It must not enter a controller's
    // mutation queue: an unavailable metadata request must never block a later user goal or turn.
    resolveGoal: () =>
      client.request("thread/goal/get", { threadId }, NOTIFICATION_INSPECTION_TIMEOUT_MS),
    resolveThread: () =>
      client.request(
        "thread/read",
        { threadId, includeTurns: false },
        NOTIFICATION_INSPECTION_TIMEOUT_MS,
      ),
  };
}
