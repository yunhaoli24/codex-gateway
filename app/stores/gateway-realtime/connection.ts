import { useEventListener } from "@vueuse/core";
import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { useAuthStore } from "@/stores/auth";
import { createUuid } from "@/lib/uuid";

const RESUME_PING_TIMEOUT_MS = 4_000;

interface RealtimeConnectionOptions {
  disconnectedMessage: () => string;
  onMessage: (message: RealtimeServerMessage) => void;
  onDisconnected: (error: Error) => void;
}

export function createRealtimeConnection(options: RealtimeConnectionOptions) {
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
  });

  function connect() {
    if (!import.meta.client) return;

    const existing = state.socket;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    clearReconnectTimer();

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

    socket.addEventListener("message", (event) => {
      if (state.generation !== generation) return;
      options.onMessage(JSON.parse(String(event.data)) as RealtimeServerMessage);
    });

    socket.addEventListener("close", () => {
      if (state.generation !== generation) return;
      clearHealthTimer();
      state.connected = false;
      state.socket = null;
      options.onDisconnected(new Error(options.disconnectedMessage()));
      scheduleReconnect();
    });

    socket.addEventListener("error", () => socket.close());
  }

  function reconnectNow() {
    if (!import.meta.client) return;

    clearReconnectTimer();
    clearHealthTimer();
    closeCurrentSocket();
    options.onDisconnected(new Error(options.disconnectedMessage()));
    connect();
  }

  function reset() {
    if (!import.meta.client) return;

    clearReconnectTimer();
    clearHealthTimer();
    closeCurrentSocket();
    state.reconnectAttempt = 0;
    state.readyCount = 0;
    options.onDisconnected(new Error(options.disconnectedMessage()));
  }

  function closeCurrentSocket() {
    const socket = state.socket;
    state.generation += 1;
    state.socket = null;
    state.connected = false;
    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
      socket.close();
    }
  }

  function scheduleReconnect() {
    if (!import.meta.client || state.reconnectTimer) return;

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
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function installHealthCheck() {
    if (!import.meta.client || state.healthListenersInstalled) return;

    state.healthListenersInstalled = true;
    useEventListener(window, "focus", checkConnection);
    useEventListener(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") checkConnection();
    });
  }

  function checkConnection() {
    if (!import.meta.client) return;

    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !state.connected) {
      reconnectNow();
      return;
    }

    const nonce = createUuid();
    clearHealthTimer();
    state.healthNonce = nonce;
    state.healthTimer = window.setTimeout(() => {
      if (state.healthNonce === nonce) reconnectNow();
    }, RESUME_PING_TIMEOUT_MS);
    send({ type: "ping", nonce });
  }

  function acknowledgePong(nonce?: string) {
    if (nonce && nonce !== state.healthNonce) return;
    clearHealthTimer();
  }

  function markReady() {
    state.connected = true;
    state.reconnectAttempt = 0;
    state.readyCount += 1;
  }

  function clearReconnectTimer() {
    if (!state.reconnectTimer) return;
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  function clearHealthTimer() {
    if (state.healthTimer) {
      window.clearTimeout(state.healthTimer);
      state.healthTimer = null;
    }
    state.healthNonce = null;
  }

  return {
    state,
    connect,
    reconnectNow,
    reset,
    scheduleReconnect,
    send,
    installHealthCheck,
    checkConnection,
    acknowledgePong,
    markReady,
  };
}
