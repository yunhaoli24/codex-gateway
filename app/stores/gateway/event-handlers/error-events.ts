import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayConfigStore } from "@/stores/gateway-config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { appServerTurnErrorFromNotification } from "../errors";
import { pinnedKey, titleForThread } from "../thread-utils/identity";
import type { GatewayEventHandlerRegistry } from "./types";
import { idFromUnknown } from "~~/shared/utils/records";
import { useGatewayTurnRecoveryStore } from "@/stores/gateway-turn-recovery";
import { misalignmentDetailsFromNotification } from "../errors";

export const errorEventHandlers: GatewayEventHandlerRegistry = {
  "error.reported": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "error.reported") return;
    const params = canonical.params;
    const gateway = useGatewayBootstrapStore();
    const error = appServerTurnErrorFromNotification(params, gateway.t);
    const turnIdValue = idFromUnknown(params.turnId);
    const turnId = turnIdValue === null ? "" : String(turnIdValue);
    const misalignment = misalignmentDetailsFromNotification(params);
    if (misalignment?.steer !== null && misalignment !== null) {
      useGatewayTurnRecoveryStore().setRequest({
        hostId: event.hostId,
        threadId,
        turnId: turnId === "" ? null : turnId,
        ...misalignment,
      });
      return;
    }
    if (
      turnId !== "" &&
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
      turnId: turnId === "" ? null : turnId,
      transient: error.willRetry,
    });
  },
  "thread.realtime.error": (event, threadId) => {
    const gateway = useGatewayBootstrapStore();
    const canonical = event.event;
    if (canonical.type !== "thread.realtime.error") return;
    gateway.setError(threadScopedErrorMessage(event.hostId, threadId, canonical.message), {
      hostId: event.hostId,
      threadId,
    });
  },
};

function threadScopedErrorMessage(hostId: number, threadId: string, message: string) {
  const gateway = useGatewayBootstrapStore();
  return [
    gateway.t("app.threadErrorContext", { title: threadErrorTitle(hostId, threadId) }),
    message,
  ]
    .filter((value) => value !== "")
    .join("\n");
}

function threadErrorTitle(hostId: number, threadId: string) {
  const config = useGatewayConfigStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = pinnedKey(hostId, threadId);
  const selected =
    navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId
      ? views.currentThread
      : null;
  const view = views.threadViews[key]?.currentThread;
  const listed = navigation.threads.find((thread) => String(thread.id) === threadId);
  const pinned = config.gatewayConfig.pinnedThreads.find(
    (thread) => thread.hostId === hostId && thread.threadId === threadId,
  );
  return titleForThread(selected ?? view ?? listed ?? pinned ?? { id: threadId });
}
