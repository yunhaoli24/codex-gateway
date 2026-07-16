import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { appServerTurnErrorFromNotification } from "../errors";
import { pinnedKey, titleForThread } from "../thread-utils/identity";
import type { GatewayEventHandlerRegistry } from "./types";

export const errorEventHandlers: GatewayEventHandlerRegistry = {
  error: (event, params, threadId) => {
    const gateway = useGatewayStore();
    const error = appServerTurnErrorFromNotification(params, gateway.t);
    const turnId = typeof params.turnId === "string" ? params.turnId : String(params.turnId ?? "");
    if (
      turnId &&
      useGatewayThreadTurnsStore().maybeQueueServerOverloadedRetry(
        event.hostId,
        threadId,
        turnId,
        error,
      )
    )
      return;
    gateway.setError(threadScopedErrorMessage(event.hostId, threadId, error.toDisplayMessage()), {
      hostId: event.hostId,
      threadId,
      turnId: turnId || null,
      transient: error.willRetry,
    });
  },
  "thread/realtime/error": (event, params, threadId) => {
    const gateway = useGatewayStore();
    gateway.setError(
      threadScopedErrorMessage(
        event.hostId,
        threadId,
        params.message || gateway.t("app.appServerError"),
      ),
      { hostId: event.hostId, threadId },
    );
  },
};

function threadScopedErrorMessage(hostId: number, threadId: string, message: string) {
  const gateway = useGatewayStore();
  return [
    gateway.t("app.threadErrorContext", { title: threadErrorTitle(hostId, threadId) }),
    message,
  ]
    .filter(Boolean)
    .join("\n");
}

function threadErrorTitle(hostId: number, threadId: string) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = pinnedKey(hostId, threadId);
  const selected =
    navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId
      ? views.currentThread
      : null;
  const view = views.threadViews[key]?.currentThread;
  const listed = navigation.threads.find((thread: any) => String(thread?.id) === threadId);
  const pinned = gateway.gatewayConfig.pinnedThreads.find(
    (thread) => thread.hostId === hostId && thread.threadId === threadId,
  );
  return titleForThread(selected || view || listed || pinned || { id: threadId });
}
