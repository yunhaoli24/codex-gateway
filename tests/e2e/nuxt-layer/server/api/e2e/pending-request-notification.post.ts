import type { GatewayEvent, RpcEnvelope } from "~~/shared/types";
import { codexProviderAdapter } from "../../../../../../server/utils/gateway/agent/providers/codex/codex-provider";
import { dispatchThreadRuntimeNotification } from "../../../../../../server/utils/gateway/notifications/thread-notification-dispatcher";
import { defineGatewayEventHandler } from "../../../../../../server/utils/gateway/http/errors";
import { pendingServerRequests } from "../../../../../../server/utils/gateway/runtime/pending-server-requests";
import { gatewayMemoryState } from "../../../../../../server/utils/gateway/state/memory";

export default defineGatewayEventHandler(async () => {
  const hostId = 1;
  const threadId = "pending-notification-race";
  const requestId = 77;
  const request: RpcEnvelope = {
    id: requestId,
    method: "item/tool/requestUserInput",
    params: {
      threadId,
      turnId: "turn-1",
      itemId: "question-1",
      questions: [],
      isBlocking: true,
      autoResolutionMs: null,
    },
  };
  pendingServerRequests.track(hostId, threadId, request);
  const before = new Set(gatewayMemoryState.publishedNotificationKeys);
  const mapped = codexProviderAdapter.mapNotification({
    method: request.method,
    params: request.params,
    id: request.id,
  });
  if (mapped.kind !== "event") {
    throw new Error("Fixture notification produced no canonical event");
  }
  const event: GatewayEvent = {
    id: 1,
    hostId,
    threadId,
    event: mapped.event,
    createdAt: new Date().toISOString(),
  };
  dispatchThreadRuntimeNotification(event, {
    resolveThread: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { thread: { id: threadId, name: "Pending notification race" } };
    },
  });
  pendingServerRequests.resolve(hostId, threadId, requestId);
  await new Promise((resolve) => setTimeout(resolve, 75));
  return {
    publishedKeys: gatewayMemoryState.publishedNotificationKeys.filter((key) => !before.has(key)),
  };
});
