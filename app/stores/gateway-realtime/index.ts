import { EventEmitter } from "@posva/event-emitter";
import { defineStore } from "pinia";
import type { RealtimeServerMessage, TerminalSessionSnapshot } from "~~/shared/types";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { createRealtimeConnection } from "./connection";
import { createRealtimeRequestBroker } from "./request-broker";
import {
  registerRealtimeServerMessageHandlers,
  type RealtimeServerMessageMap,
} from "./server-message-handlers";
import { createRealtimeThreadSubscriptions } from "./thread-subscriptions";
import { createPinnedThreadSync } from "./pinned-thread-sync";

export const useGatewayRealtimeStore = defineStore("gateway-realtime", () => {
  const { t } = useI18n();
  const lifecycleNotificationKeys = new Set<string>();
  const serverMessages = new EventEmitter<RealtimeServerMessageMap>();

  const connection = createRealtimeConnection({
    disconnectedMessage: () => t("app.realtimeDisconnected"),
    onMessage: receiveServerMessage,
    onDisconnected: (error) => requestBroker.rejectAllRequests(error),
  });
  const requestBroker = createRealtimeRequestBroker({
    waitForReady: connection.waitForReady,
    send: connection.send,
    unavailableMessage: () => t("app.realtimeUnavailable"),
    timeoutMessage: () => t("app.realtimeRequestTimedOut"),
  });
  const subscriptions = createRealtimeThreadSubscriptions({
    connect: connection.connect,
    send: connection.send,
  });
  const pinnedThreadSync = createPinnedThreadSync();

  registerRealtimeServerMessageHandlers(serverMessages, {
    t,
    readyCount: () => connection.state.readyCount,
    markReady,
    lifecycleNotificationKeys,
    resubscribe: subscriptions.resubscribe,
    resolveRequest: requestBroker.resolveRequest,
    rejectRequest: requestBroker.rejectRequest,
    acknowledgePong: connection.acknowledgePong,
    restoreTerminalSessions,
    refreshSelectedThreadAfterReconnect,
    refreshPinnedThreads,
    advanceThreadSubscriptionCursor: subscriptions.advanceThreadSubscriptionCursor,
  });

  function receiveServerMessage(message: RealtimeServerMessage) {
    serverMessages.emit(message.type, message as never);
  }

  function markReady() {
    connection.markReady();
    if (connection.state.readyCount > 1) useGatewayBrowserStore().resetRuntime();
  }

  function resetForSessionChange() {
    connection.reset();
    subscriptions.reset();
    lifecycleNotificationKeys.clear();
  }

  async function restoreTerminalSessions() {
    try {
      const response = await requestBroker.request<{ sessions: TerminalSessionSnapshot[] }>(
        (requestId) => ({ type: "terminal.list", requestId }),
      );
      useGatewayTerminalStore().replaceTerminalSessions(response.sessions ?? []);
    } catch {
      // Realtime reconnect may race with Nuxt hydration. The next ready event retries.
    }
  }

  function refreshSelectedThreadAfterReconnect() {
    const navigation = useGatewayNavigationStore();
    if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
    void useGatewayThreadViewStore()
      .refreshSelectedThreadSnapshot({ scrollToLatest: true })
      .catch((error: unknown) => {
        console.warn("[gateway] failed to refresh selected thread after realtime reconnect", error);
      });
  }

  function refreshPinnedThreads() {
    void pinnedThreadSync.refresh().catch((error: unknown) => {
      console.warn("[gateway] failed to refresh pinned threads", error);
    });
  }

  return {
    ...toRefs(connection.state),
    ...toRefs(subscriptions.state),
    connect: connection.connect,
    reconnectNow: connection.reconnectNow,
    resetForSessionChange,
    scheduleReconnect: connection.scheduleReconnect,
    send: connection.send,
    request: requestBroker.request,
    installHealthCheck: connection.installHealthCheck,
    checkConnection: connection.checkConnection,
    connectHostLifecycleEvents: subscriptions.connectHostLifecycleEvents,
    connectThreadEvents: subscriptions.connectThreadEvents,
    rememberThreadSubscription: subscriptions.rememberThreadSubscription,
    closeThreadEvents: subscriptions.closeThreadEvents,
    closeHostThreadEvents: subscriptions.closeHostThreadEvents,
    receiveServerMessage,
  };
});
