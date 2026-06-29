import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

export function connectRealtimeSocket(ctx: GatewayStoreContext) {
  if (!import.meta.client) {
    return;
  }
  const existing = ctx.state.realtimeSocket;
  if (
    existing &&
    (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (ctx.state.realtimeSocketReconnectTimer) {
    window.clearTimeout(ctx.state.realtimeSocketReconnectTimer);
    ctx.state.realtimeSocketReconnectTimer = null;
  }

  const generation = ctx.state.realtimeSocketGeneration + 1;
  ctx.state.realtimeSocketGeneration = generation;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
  ctx.state.realtimeSocket = socket;

  socket.addEventListener("open", () => {
    if (ctx.state.realtimeSocketGeneration !== generation) {
      socket.close();
      return;
    }
    ctx.state.realtimeSocketConnected = true;
    ctx.state.realtimeSocketReconnectAttempt = 0;
    ctx.resubscribeRealtime();
  });

  socket.addEventListener("message", (message) => {
    if (ctx.state.realtimeSocketGeneration !== generation) {
      return;
    }
    ctx.handleRealtimeMessage(JSON.parse(String(message.data)) as RealtimeServerMessage);
  });

  socket.addEventListener("close", () => {
    if (ctx.state.realtimeSocketGeneration !== generation) {
      return;
    }
    ctx.state.realtimeSocketConnected = false;
    ctx.state.realtimeSocket = null;
    ctx.scheduleRealtimeReconnect();
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

export function scheduleRealtimeReconnect(ctx: GatewayStoreContext) {
  if (!import.meta.client || ctx.state.realtimeSocketReconnectTimer) {
    return;
  }
  const attempt = ctx.state.realtimeSocketReconnectAttempt + 1;
  ctx.state.realtimeSocketReconnectAttempt = attempt;
  const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt - 1, 5));
  ctx.state.realtimeSocketReconnectTimer = window.setTimeout(() => {
    ctx.state.realtimeSocketReconnectTimer = null;
    ctx.connectRealtime();
  }, delay);
}

export function sendRealtimeMessage(ctx: GatewayStoreContext, message: RealtimeClientMessage) {
  ctx.connectRealtime();
  const socket = ctx.state.realtimeSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}
