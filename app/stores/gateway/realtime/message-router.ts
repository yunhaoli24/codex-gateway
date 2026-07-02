import type { RealtimeServerMessage } from "~~/shared/types";
import { handleRealtimeThreadEvent } from "./event-recording";
import { handleHostLifecycleRealtime } from "./host-lifecycle";
import {
  realtimeRequestErrorFromServer,
  rejectRealtimeRequest,
  resolveRealtimeRequest,
} from "./request-response";
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
    void ctx.restoreTerminalSessions();
  },
  "host.lifecycle": (ctx, message, lifecycleNotificationKeys) => {
    handleHostLifecycleRealtime(ctx, message.event, lifecycleNotificationKeys);
  },
  "thread.event": (ctx, message) => {
    handleRealtimeThreadEvent(ctx, message.event);
  },
  "thread.snapshot": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "thread.goal.updated": (ctx, message) => {
    ctx.upsertThreadGoal(message.hostId, message.threadId, message.goal);
    resolveRealtimeRequest(message);
  },
  "thread.goal.cleared": (ctx, message) => {
    ctx.clearThreadGoalState(message.hostId, message.threadId);
    resolveRealtimeRequest(message);
  },
  "thread.goal.snapshot": (ctx, message) => {
    if (message.goal) {
      ctx.upsertThreadGoal(message.hostId, message.threadId, message.goal);
    } else {
      ctx.clearThreadGoalState(message.hostId, message.threadId);
    }
    resolveRealtimeRequest(message);
  },
  "turn.start.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "turn.steer.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "turn.interrupt.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "serverRequest.respond.accepted": (_ctx, message) => {
    resolveRealtimeRequest(message);
  },
  "terminal.opened": (ctx, message) => {
    ctx.upsertTerminalSession(message.session);
    resolveRealtimeRequest(message);
  },
  "terminal.snapshot": (ctx, message) => {
    ctx.replaceTerminalSessions(message.sessions);
    resolveRealtimeRequest(message);
  },
  "terminal.closed": (ctx, message) => {
    ctx.removeTerminalSession(message.sessionId);
    resolveRealtimeRequest(message);
  },
  "terminal.closed.event": (ctx, message) => {
    ctx.removeTerminalSession(message.sessionId);
  },
  "terminal.output": (ctx, message) => {
    ctx.appendTerminalOutput(message.sessionId, message.data);
  },
  "terminal.exited": (ctx, message) => {
    ctx.markTerminalExited(message.sessionId, ctx.t("app.terminalExited"));
  },
  "terminal.error": (ctx, message) => {
    if (message.sessionId) {
      ctx.markTerminalExited(message.sessionId, message.message);
    }
    if (message.requestId) {
      rejectRealtimeRequest(message.requestId, new Error(message.message));
    }
    ctx.setError(message.message);
  },
  error: (ctx, message) => {
    const requestError = realtimeRequestErrorFromServer(
      message.message,
      message.request && "requestId" in message.request ? message.request : undefined,
      message.details ?? {},
    );
    if (message.requestId) {
      rejectRealtimeRequest(message.requestId, requestError);
    }
    ctx.setError(requestError.message, {
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
