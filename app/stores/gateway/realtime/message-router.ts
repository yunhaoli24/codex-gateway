import type { RealtimeServerMessage } from "~~/shared/types";
import { handleRealtimeThreadEvent } from "./event-recording";
import { handleHostLifecycleRealtime } from "./host-lifecycle";
import { probeRunningThreadStatuses } from "./thread-status-probe";
import type { GatewayStoreContext } from "../types";

export function routeRealtimeMessage(
  ctx: GatewayStoreContext,
  message: RealtimeServerMessage,
  lifecycleNotificationKeys: Set<string>,
) {
  if (message.type === "ready") {
    ctx.state.realtimeSocketConnected = true;
    ctx.state.realtimeSocketReconnectAttempt = 0;
    ctx.resubscribeRealtime();
    void probeRunningThreadStatuses(ctx);
    return;
  }
  if (message.type === "host.lifecycle") {
    handleHostLifecycleRealtime(ctx, message.event, lifecycleNotificationKeys);
    return;
  }
  if (message.type === "thread.event") {
    handleRealtimeThreadEvent(ctx, message.event);
    return;
  }
  if (message.type === "thread.closed") {
    ctx.retryThreadSubscription(message.hostId, message.threadId);
    return;
  }
  if (message.type === "error") {
    ctx.setError(message.message, {
      hostId: message.request && "hostId" in message.request ? message.request.hostId : null,
      threadId: message.request && "threadId" in message.request ? message.request.threadId : null,
    });
  }
}
