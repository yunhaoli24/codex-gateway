import { defineStore } from "pinia";
import type { ToRefs } from "vue";
import type { RealtimeServerMessage } from "~~/shared/types";
import { useGatewayTranslator } from "@/composables/i18n/useGatewayTranslator";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import { createRealtimeConnection, type RealtimeConnectionState } from "./connection";
import { createRealtimeRequestBroker } from "./request-broker";
import { createRealtimeServerMessageDispatcher } from "./server-message-handlers";
import {
  createRealtimeThreadSubscriptions,
  type RealtimeThreadSubscriptionState,
} from "./thread-subscriptions";
import { realtimeRequestContext } from "./request-context";
import {
  decodeTerminalStreamFrame,
  decodeTerminalTextPayload,
  terminalStreamOpcode,
} from "~~/shared/runtime/terminal-stream";

type RealtimeConnection = ReturnType<typeof createRealtimeConnection>;
type RealtimeRequestBroker = ReturnType<typeof createRealtimeRequestBroker>;
type RealtimeSubscriptions = ReturnType<typeof createRealtimeThreadSubscriptions>;

export type GatewayRealtimeSetup = ToRefs<RealtimeConnectionState> &
  ToRefs<RealtimeThreadSubscriptionState> & {
    connect: RealtimeConnection["connect"];
    reconnectNow: RealtimeConnection["reconnectNow"];
    resetForSessionChange: () => void;
    scheduleReconnect: RealtimeConnection["scheduleReconnect"];
    send: RealtimeConnection["send"];
    sendBinary: RealtimeConnection["sendBinary"];
    request: RealtimeRequestBroker["request"];
    installHealthCheck: RealtimeConnection["installHealthCheck"];
    checkConnection: RealtimeConnection["checkConnection"];
    connectHostLifecycleEvents: RealtimeSubscriptions["connectHostLifecycleEvents"];
    connectThreadEvents: RealtimeSubscriptions["connectThreadEvents"];
    rememberThreadSubscription: RealtimeSubscriptions["rememberThreadSubscription"];
    closeThreadEvents: RealtimeSubscriptions["closeThreadEvents"];
    cancelThreadEvents: RealtimeSubscriptions["cancelThreadEvents"];
    closeHostThreadEvents: RealtimeSubscriptions["closeHostThreadEvents"];
    receiveServerMessage: (message: RealtimeServerMessage) => void;
  };

export const useGatewayRealtimeStore = defineStore("gateway-realtime", (): GatewayRealtimeSetup => {
  const t = useGatewayTranslator();
  let rejectPendingRequests = (_error: Error) => {};
  let dispatchServerMessage = (_message: RealtimeServerMessage) => {};

  const connection = createRealtimeConnection({
    disconnectedMessage: () => t("app.realtimeDisconnected"),
    onMessage: receiveServerMessage,
    onBinaryMessage: receiveBinaryMessage,
    onDisconnected: (error) => rejectPendingRequests(error),
  });
  const requestBroker = createRealtimeRequestBroker({
    waitForReady: connection.waitForReady,
    send: connection.send,
    unavailableMessage: () => t("app.realtimeUnavailable"),
    timeoutMessage: () => t("app.realtimeRequestTimedOut"),
    requestContext: realtimeRequestContext,
  });
  rejectPendingRequests = requestBroker.rejectAllRequests;
  const subscriptions = createRealtimeThreadSubscriptions({
    connect: connection.connect,
    send: connection.send,
  });
  dispatchServerMessage = createRealtimeServerMessageDispatcher({
    t,
    readyCount: () => connection.state.readyCount,
    markReady,
    resubscribe: subscriptions.resubscribe,
    resolveRequest: requestBroker.resolveRequest,
    rejectRequest: requestBroker.rejectRequest,
    acknowledgePong: connection.acknowledgePong,
    restoreTerminalSessions,
    advanceThreadSubscriptionCursor: subscriptions.advanceThreadSubscriptionCursor,
  });

  function receiveServerMessage(message: RealtimeServerMessage) {
    dispatchServerMessage(message);
  }

  function receiveBinaryMessage(data: Uint8Array) {
    const frame = decodeTerminalStreamFrame(data);
    if (frame?.opcode !== terminalStreamOpcode.output) return;
    const output = decodeTerminalTextPayload(frame);
    if (output === null) return;
    gatewayDomainEvents.emit("realtime-terminal-output", {
      sessionId: frame.sessionId,
      data: output,
    });
  }

  function markReady() {
    connection.markReady();
  }

  function resetForSessionChange() {
    connection.reset();
    subscriptions.reset();
    gatewayDomainEvents.emit("gateway-session-reset");
  }

  async function restoreTerminalSessions() {
    try {
      await requestBroker.request((requestId) => ({ type: "terminal.list", requestId }));
    } catch {
      // Realtime reconnect may race with Nuxt hydration. The next ready event retries.
    }
  }

  return {
    ...toRefs(connection.state),
    ...toRefs(subscriptions.state),
    connect: connection.connect,
    reconnectNow: connection.reconnectNow,
    resetForSessionChange,
    scheduleReconnect: connection.scheduleReconnect,
    send: connection.send,
    sendBinary: connection.sendBinary,
    request: requestBroker.request,
    installHealthCheck: connection.installHealthCheck,
    checkConnection: connection.checkConnection,
    connectHostLifecycleEvents: subscriptions.connectHostLifecycleEvents,
    connectThreadEvents: subscriptions.connectThreadEvents,
    rememberThreadSubscription: subscriptions.rememberThreadSubscription,
    closeThreadEvents: subscriptions.closeThreadEvents,
    cancelThreadEvents: subscriptions.cancelThreadEvents,
    closeHostThreadEvents: subscriptions.closeHostThreadEvents,
    receiveServerMessage,
  };
});
