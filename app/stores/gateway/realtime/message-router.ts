import type { RealtimeServerMessage } from "~~/shared/types";
import { handleRealtimeThreadEvent } from "./event-recording";
import { handleHostLifecycleRealtime } from "./host-lifecycle";
import { rejectRealtimeRequest, resolveRealtimeRequest } from "./request-response";
import type { GatewayStoreContext } from "../types";

type RealtimeServerMessageHandler<T extends RealtimeServerMessage["type"]> = (
  ctx: GatewayStoreContext,
  message: Extract<RealtimeServerMessage, { type: T }>,
  lifecycleNotificationKeys: Set<string>,
) => void;

type RealtimeServerMessageHandlerRegistry = {
  [K in RealtimeServerMessage["type"]]: RealtimeServerMessageHandler<K>;
};

const realtimeServerMessageHandlers = {
  ready: (ctx) => {
    ctx.state.realtimeSocketConnected = true;
    ctx.state.realtimeSocketReconnectAttempt = 0;
    ctx.resubscribeRealtime();
  },
  "host.lifecycle": (ctx, message, lifecycleNotificationKeys) => {
    handleHostLifecycleRealtime(ctx, message.event, lifecycleNotificationKeys);
  },
  "thread.event": (ctx, message) => {
    handleRealtimeThreadEvent(ctx, message.event);
  },
  "turn.steer.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "turn.interrupt.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  error: (ctx, message) => {
    if (message.requestId) {
      rejectRealtimeRequest(message.requestId, new Error(message.message));
    }
    ctx.setError(message.message, {
      hostId: message.request && "hostId" in message.request ? message.request.hostId : null,
      threadId: message.request && "threadId" in message.request ? message.request.threadId : null,
    });
  },
  pong: () => {},
} satisfies RealtimeServerMessageHandlerRegistry;

export function routeRealtimeMessage(
  ctx: GatewayStoreContext,
  message: RealtimeServerMessage,
  lifecycleNotificationKeys: Set<string>,
) {
  realtimeServerMessageHandlers[message.type](ctx, message as never, lifecycleNotificationKeys);
}
