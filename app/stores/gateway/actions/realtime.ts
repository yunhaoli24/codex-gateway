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
  rememberThreadSubscription,
  resubscribeRealtime,
} from "../realtime/subscriptions";
import {
  connectRealtimeSocket,
  scheduleRealtimeReconnect,
  sendRealtimeMessage,
} from "../realtime/socket";
import { setThreadRunning, setThreadStatus, setThreadTokenUsage } from "../realtime/thread-status";
import { projectThreadRuntime } from "../thread-runtime/projector";
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

    threadRuntimeProjection(hostId: number, threadId: string) {
      return projectThreadRuntime(ctx, hostId, threadId);
    },

    connectEvents(hostId = ctx.state.selectedHostId, threadId = ctx.state.selectedThreadId) {
      connectThreadEvents(ctx, hostId, threadId);
    },

    closeThreadEvents(hostId: number, threadId: string) {
      closeThreadEvents(ctx, hostId, threadId);
    },

    rememberThreadSubscription(hostId: number, threadId: string, afterId: number) {
      rememberThreadSubscription(ctx, hostId, threadId, afterId);
    },

    recordThreadEvent(event: GatewayEvent) {
      recordThreadEvent(ctx, event);
    },

    applyLiveEvent(event: GatewayEvent) {
      applyLiveThreadEvent(ctx, event);
    },
  };
}
