import type {
  GatewayEvent,
  RealtimeClientMessage,
  RealtimeServerMessage,
  ThreadTokenUsageState,
} from "~~/shared/types";
import { applyLiveThreadEvent, recordThreadEvent } from "../realtime/event-recording";
import { routeRealtimeMessage } from "../realtime/message-router";
import {
  connectHostLifecycleEvents,
  connectThreadEvents,
  closeThreadEvents,
  resubscribeRealtime,
  retryThreadSubscription,
} from "../realtime/subscriptions";
import {
  connectRealtimeSocket,
  scheduleRealtimeReconnect,
  sendRealtimeMessage,
} from "../realtime/socket";
import { probeRunningThreadStatuses } from "../realtime/thread-status-probe";
import { setThreadRunning, setThreadStatus, setThreadTokenUsage } from "../realtime/thread-status";
import type { GatewayStoreContext, ThreadRuntimeStatus, ThreadStatusUpdateOptions } from "../types";

export function createRealtimeActions(ctx: GatewayStoreContext) {
  const lifecycleNotificationKeys = new Set<string>();

  return {
    connectRealtime() {
      connectRealtimeSocket(ctx);
    },

    scheduleRealtimeReconnect() {
      scheduleRealtimeReconnect(ctx);
    },

    sendRealtime(message: RealtimeClientMessage) {
      return sendRealtimeMessage(ctx, message);
    },

    resubscribeRealtime() {
      resubscribeRealtime(ctx);
    },

    connectHostLifecycleEvents() {
      connectHostLifecycleEvents(ctx);
    },

    handleRealtimeMessage(message: RealtimeServerMessage) {
      routeRealtimeMessage(ctx, message, lifecycleNotificationKeys);
    },

    retryThreadSubscription(hostId: number, threadId: string) {
      retryThreadSubscription(ctx, hostId, threadId);
    },

    setThreadRunning(hostId: number, threadId: string, running: boolean) {
      setThreadRunning(ctx, hostId, threadId, running);
    },

    setThreadStatus(
      hostId: number,
      threadId: string,
      status: ThreadRuntimeStatus,
      options?: ThreadStatusUpdateOptions,
    ) {
      setThreadStatus(ctx, hostId, threadId, status, options);
    },

    setThreadTokenUsage(hostId: number, threadId: string, tokenUsage: ThreadTokenUsageState) {
      setThreadTokenUsage(ctx, hostId, threadId, tokenUsage);
    },

    connectEvents(hostId = ctx.state.selectedHostId, threadId = ctx.state.selectedThreadId) {
      connectThreadEvents(ctx, hostId, threadId);
    },

    closeThreadEvents(hostId: number, threadId: string) {
      closeThreadEvents(ctx, hostId, threadId);
    },

    recordThreadEvent(event: GatewayEvent) {
      recordThreadEvent(ctx, event);
    },

    applyLiveEvent(event: GatewayEvent, options?: { notifyTerminal?: boolean }) {
      applyLiveThreadEvent(ctx, event, options);
    },

    probeRunningThreadStatuses() {
      return probeRunningThreadStatuses(ctx);
    },
  };
}
