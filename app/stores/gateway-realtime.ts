import { useEventListener } from "@vueuse/core";
import { defineStore } from "pinia";
import { EventEmitter } from "@posva/event-emitter";
import type { GatewayEvent, RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { CLIENT_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { useAuthStore } from "@/stores/auth";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { pinnedKey } from "./gateway/thread-utils/identity";
import { RealtimeRequestError } from "./gateway-realtime/request-errors";
import {
  registerRealtimeServerMessageHandlers,
  type RealtimeServerMessageMap,
} from "./gateway-realtime/server-message-handlers";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;
type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

interface RealtimeThreadSubscription {
  hostId: number;
  threadId: string;
  afterId: number;
}

interface PendingRealtimeRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: number;
  request: RealtimeRequestMessage;
}

const RESUME_PING_TIMEOUT_MS = 4_000;
const REALTIME_READY_TIMEOUT_MS = 15_000;
// A request can include SSH reconnect and a remote Codex upgrade before the
// app-server RPC starts. Keep the browser deadline beyond the backend's 30m cap.
const REALTIME_REQUEST_TIMEOUT_MS = 31 * 60_000;

export const useGatewayRealtimeStore = defineStore("gateway-realtime", () => {
  const { t } = useI18n();
  const state = reactive({
    socket: null as WebSocket | null,
    connected: false,
    reconnectTimer: null as number | null,
    reconnectAttempt: 0,
    generation: 0,
    readyCount: 0,
    healthTimer: null as number | null,
    healthNonce: null as string | null,
    healthListenersInstalled: false,
    hostLifecycleSubscribed: false,
    threadSubscriptions: {} as Record<string, RealtimeThreadSubscription>,
  });
  const lifecycleNotificationKeys = new Set<string>();
  const pendingRequests = new Map<string, PendingRealtimeRequest>();
  const serverMessages = new EventEmitter<RealtimeServerMessageMap>();

  registerRealtimeServerMessageHandlers(serverMessages, {
    t,
    readyCount: () => state.readyCount,
    markReady,
    lifecycleNotificationKeys,
    resubscribe,
    resolveRequest,
    rejectRequest,
    acknowledgePong,
    restoreTerminalSessions,
    refreshSelectedThreadAfterReconnect,
    advanceThreadSubscriptionCursor,
  });

  function connect() {
    if (!import.meta.client) {
      return;
    }
    const existing = state.socket;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    const generation = state.generation + 1;
    state.generation = generation;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const auth = useAuthStore();
    auth.hydrate();
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    state.socket = socket;

    socket.addEventListener("open", () => {
      if (state.generation !== generation) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: "auth.authenticate", token: auth.token }));
    });

    socket.addEventListener("message", (message) => {
      if (state.generation !== generation) {
        return;
      }
      receiveServerMessage(JSON.parse(String(message.data)) as RealtimeServerMessage);
    });

    socket.addEventListener("close", () => {
      if (state.generation !== generation) {
        return;
      }
      clearHealthTimer();
      state.connected = false;
      state.socket = null;
      rejectAllRequests(new Error(t("app.realtimeDisconnected")));
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  function reconnectNow() {
    if (!import.meta.client) {
      return;
    }
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    clearHealthTimer();
    const socket = state.socket;
    state.generation += 1;
    state.connected = false;
    state.socket = null;
    rejectAllRequests(new Error(t("app.realtimeDisconnected")));
    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
      socket.close();
    }
    connect();
  }

  function resetForSessionChange() {
    if (!import.meta.client) {
      return;
    }
    const socket = state.socket;
    state.generation += 1;
    state.socket = null;
    state.connected = false;
    state.reconnectAttempt = 0;
    state.readyCount = 0;
    state.hostLifecycleSubscribed = false;
    state.threadSubscriptions = {};
    lifecycleNotificationKeys.clear();
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    clearHealthTimer();
    rejectAllRequests(new Error(t("app.realtimeDisconnected")));
    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
      socket.close();
    }
  }

  function scheduleReconnect() {
    if (!import.meta.client || state.reconnectTimer) {
      return;
    }
    const attempt = state.reconnectAttempt + 1;
    state.reconnectAttempt = attempt;
    const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt - 1, 5));
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay);
  }

  function send(message: RealtimeClientMessage) {
    connect();
    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  async function request<T>(
    buildMessage: (requestId: string) => RealtimeRequestMessage,
    timeoutMs = REALTIME_REQUEST_TIMEOUT_MS,
  ) {
    await waitForReady(REALTIME_READY_TIMEOUT_MS);
    const requestId = `gateway-ws-${crypto.randomUUID()}`;
    const requestMessage = buildMessage(requestId);
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(
          new RealtimeRequestError(t("app.realtimeRequestTimedOut"), requestMessage, "timeout", {
            requestId,
            timeoutMs,
            ...requestHostDetails(requestMessage),
          }),
        );
      }, timeoutMs);
      pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        request: requestMessage,
      });
      if (!send(requestMessage)) {
        rejectRequest(
          requestId,
          new RealtimeRequestError(t("app.realtimeUnavailable"), requestMessage, "unavailable", {
            requestId,
            ...requestHostDetails(requestMessage),
          }),
        );
      }
    });
  }

  function installHealthCheck() {
    if (!import.meta.client || state.healthListenersInstalled) {
      return;
    }
    state.healthListenersInstalled = true;
    useEventListener(window, "focus", checkConnection);
    useEventListener(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkConnection();
      }
    });
  }

  function checkConnection() {
    if (!import.meta.client) {
      return;
    }
    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !state.connected) {
      reconnectNow();
      return;
    }

    const nonce = crypto.randomUUID();
    clearHealthTimer();
    state.healthNonce = nonce;
    state.healthTimer = window.setTimeout(() => {
      if (state.healthNonce === nonce) {
        reconnectNow();
      }
    }, RESUME_PING_TIMEOUT_MS);
    send({ type: "ping", nonce });
  }

  function connectHostLifecycleEvents() {
    if (!import.meta.client) {
      return;
    }
    state.hostLifecycleSubscribed = true;
    connect();
    send({ type: "host.lifecycle.subscribe" });
  }

  function connectThreadEvents(hostId?: number | null, threadId?: string | null) {
    const gateway = useGatewayStore();
    const resolvedHostId = hostId ?? gateway.selectedHostId;
    const resolvedThreadId = threadId ?? gateway.selectedThreadId;
    if (!resolvedHostId || !resolvedThreadId) {
      return;
    }

    const key = pinnedKey(resolvedHostId, resolvedThreadId);
    const afterId =
      resolvedHostId === gateway.selectedHostId && resolvedThreadId === gateway.selectedThreadId
        ? gateway.lastEventId
        : (gateway.threadViews[key]?.lastEventId ?? 0);
    const subscription = { hostId: resolvedHostId, threadId: resolvedThreadId, afterId };
    rememberSubscription(key, subscription);
    connect();
    sendThreadSubscribe(subscription);
  }

  function rememberThreadSubscription(hostId: number, threadId: string, afterId: number) {
    rememberSubscription(pinnedKey(hostId, threadId), { hostId, threadId, afterId });
  }

  function rememberSubscription(key: string, subscription: RealtimeThreadSubscription) {
    const { [key]: _existing, ...subscriptions } = state.threadSubscriptions;
    const entries = Object.entries({ ...subscriptions, [key]: subscription });
    const protectedKeys = protectedThreadSubscriptionKeys();
    while (entries.length > CLIENT_THREAD_CACHE_LIMIT) {
      const index = entries.findIndex(([candidate]) => !protectedKeys.has(candidate));
      if (index < 0) {
        break;
      }
      const [, evicted] = entries.splice(index, 1)[0]!;
      send({ type: "thread.unsubscribe", hostId: evicted.hostId, threadId: evicted.threadId });
    }
    state.threadSubscriptions = Object.fromEntries(entries);
  }

  function protectedThreadSubscriptionKeys() {
    const gateway = useGatewayStore();
    const keys = new Set<string>();
    if (gateway.selectedHostId && gateway.selectedThreadId) {
      keys.add(pinnedKey(gateway.selectedHostId, gateway.selectedThreadId));
    }
    for (const panel of gateway.visibleSubAgentPanels) {
      keys.add(pinnedKey(panel.hostId, panel.threadId));
    }
    return keys;
  }

  function closeThreadEvents(hostId: number, threadId: string) {
    const key = pinnedKey(hostId, threadId);
    const { [key]: _closed, ...subscriptions } = state.threadSubscriptions;
    state.threadSubscriptions = subscriptions;
    send({ type: "thread.unsubscribe", hostId, threadId });
  }

  function closeHostThreadEvents(hostId: number) {
    const remaining: Record<string, RealtimeThreadSubscription> = {};
    for (const [key, subscription] of Object.entries(state.threadSubscriptions)) {
      if (subscription.hostId === hostId) {
        send({
          type: "thread.unsubscribe",
          hostId: subscription.hostId,
          threadId: subscription.threadId,
        });
      } else {
        remaining[key] = subscription;
      }
    }
    state.threadSubscriptions = remaining;
  }

  function resubscribe() {
    if (state.hostLifecycleSubscribed) {
      send({ type: "host.lifecycle.subscribe" });
    }
    for (const subscription of Object.values(state.threadSubscriptions)) {
      sendThreadSubscribe(subscription);
    }
  }

  function sendThreadSubscribe(subscription: RealtimeThreadSubscription) {
    send({
      type: "thread.subscribe",
      hostId: subscription.hostId,
      threadId: subscription.threadId,
      afterId: subscription.afterId,
    });
  }

  function receiveServerMessage(message: RealtimeServerMessage) {
    serverMessages.emit(message.type, message as never);
  }

  function markReady() {
    state.connected = true;
    state.reconnectAttempt = 0;
    state.readyCount += 1;
  }

  async function restoreTerminalSessions() {
    try {
      const response = await request<{
        sessions: import("~~/shared/types").TerminalSessionSnapshot[];
      }>((requestId) => ({ type: "terminal.list", requestId }));
      useGatewayTerminalStore().replaceTerminalSessions(response.sessions ?? []);
    } catch {
      // Realtime reconnect may race with Nuxt hydration. The next ready event retries.
    }
  }

  function refreshSelectedThreadAfterReconnect() {
    const gateway = useGatewayStore();
    if (!gateway.selectedHostId || !gateway.selectedThreadId) {
      return;
    }
    void gateway.refreshSelectedThreadSnapshot({ scrollToLatest: true }).catch((error: unknown) => {
      console.warn("[gateway] failed to refresh selected thread after realtime reconnect", error);
    });
  }

  function advanceThreadSubscriptionCursor(event: GatewayEvent) {
    const key = pinnedKey(event.hostId, event.threadId);
    const subscription = state.threadSubscriptions[key];
    if (!subscription || event.id <= subscription.afterId) {
      return;
    }
    state.threadSubscriptions = {
      ...state.threadSubscriptions,
      [key]: {
        ...subscription,
        afterId: event.id,
      },
    };
  }

  function resolveRequest(message: RealtimeResponseMessage) {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timer);
    pendingRequests.delete(message.requestId);
    pending.resolve(message);
  }

  function rejectRequest(requestId: string, error: Error) {
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.reject(error);
  }

  function rejectAllRequests(error: Error) {
    for (const [requestId, pending] of pendingRequests) {
      rejectRequest(
        requestId,
        new RealtimeRequestError(error.message, pending.request, "disconnected", {
          requestId,
          ...requestHostDetails(pending.request),
        }),
      );
    }
  }

  function requestHostDetails(request: RealtimeRequestMessage) {
    if (!("hostId" in request)) {
      return {};
    }
    const hostName = useGatewayStore().hosts.find((host) => host.id === request.hostId)?.name;
    return hostName ? { hostName } : {};
  }

  async function waitForReady(timeoutMs: number) {
    connect();
    if (state.connected) {
      return;
    }
    const startedAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      const poll = () => {
        if (state.connected) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(t("app.realtimeUnavailable")));
          return;
        }
        window.setTimeout(poll, 25);
      };
      poll();
    });
  }

  function acknowledgePong(nonce?: string) {
    if (nonce && nonce !== state.healthNonce) {
      return;
    }
    clearHealthTimer();
  }

  function clearHealthTimer() {
    if (state.healthTimer) {
      window.clearTimeout(state.healthTimer);
      state.healthTimer = null;
    }
    state.healthNonce = null;
  }

  return {
    ...toRefs(state),
    connect,
    reconnectNow,
    resetForSessionChange,
    scheduleReconnect,
    send,
    request,
    installHealthCheck,
    checkConnection,
    connectHostLifecycleEvents,
    connectThreadEvents,
    rememberThreadSubscription,
    closeThreadEvents,
    closeHostThreadEvents,
    receiveServerMessage,
  };
});
