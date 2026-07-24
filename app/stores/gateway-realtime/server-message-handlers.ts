import type { EventEmitter } from "@posva/event-emitter";
import { toast } from "vue-sonner";
import { notificationAction, projectPublishedNotification } from "./notification-actions";
import type { GatewayEvent, RealtimeServerMessage } from "~~/shared/types";
import { STALE_THREAD_CURSOR_ERROR_CODE } from "~~/shared/gateway-errors";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { realtimeRequestErrorFromServer, type RealtimeRequestError } from "./request-errors";

export type RealtimeServerMessageMap = {
  [K in RealtimeServerMessage["type"]]: Extract<RealtimeServerMessage, { type: K }>;
};

type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;
type RealtimeMessageHandler<K extends keyof RealtimeServerMessageMap> = (
  message: RealtimeServerMessageMap[K],
) => void;

export interface RealtimeServerMessageHandlerContext {
  t: (key: string) => string;
  readyCount: () => number;
  markReady: () => void;
  lifecycleNotificationKeys: Set<string>;
  resubscribe: () => void;
  resolveRequest: (message: RealtimeResponseMessage) => void;
  rejectRequest: (requestId: string, error: RealtimeRequestError | Error) => void;
  acknowledgePong: (nonce?: string) => void;
  restoreTerminalSessions: () => Promise<void>;
  refreshSelectedThreadAfterReconnect: () => void;
  refreshPinnedThreads: () => void;
  advanceThreadSubscriptionCursor: (event: GatewayEvent) => void;
}

const requestResponseMessageTypes = [
  "thread.snapshot",
  "thread.started",
  "thread.turns.page",
  "turn.start.accepted",
  "turn.steer.accepted",
  "turn.interrupt.accepted",
  "serverRequest.respond.accepted",
] as const satisfies Array<keyof RealtimeServerMessageMap>;

const locallyRecoveredRequestErrorCodes = new Set([STALE_THREAD_CURSOR_ERROR_CODE]);

export function registerRealtimeServerMessageHandlers(
  emitter: EventEmitter<RealtimeServerMessageMap>,
  ctx: RealtimeServerMessageHandlerContext,
) {
  installHandlers(emitter, createServerMessageHandlers(ctx));
  requestResponseMessageTypes.forEach((type) => emitter.on(type, ctx.resolveRequest));
}

function installHandlers(
  emitter: EventEmitter<RealtimeServerMessageMap>,
  handlers: {
    [K in keyof RealtimeServerMessageMap]?: RealtimeMessageHandler<K>;
  },
) {
  Object.entries(handlers).forEach(([type, handler]) => {
    emitter.on(type as keyof RealtimeServerMessageMap, handler as never);
  });
}

function createServerMessageHandlers(ctx: RealtimeServerMessageHandlerContext) {
  return {
    ready: () => handleReady(ctx),
    "notification.published": (message) => handlePublishedNotification(ctx, message),
    "config.pinnedThreads.changed": () => ctx.refreshPinnedThreads(),
    "host.lifecycle": (message) => handleHostLifecycle(ctx, message.event),
    "thread.event": (message) => handleThreadEvent(ctx, message.event),
    "thread.goal.updated": (message) => handleGoalUpdated(ctx, message),
    "thread.goal.cleared": (message) => handleGoalCleared(ctx, message),
    "thread.goal.snapshot": (message) => handleGoalSnapshot(ctx, message),
    "terminal.opened": (message) => handleTerminalOpened(ctx, message),
    "terminal.snapshot": (message) => handleTerminalSnapshot(ctx, message),
    "terminal.closed": (message) => handleTerminalClosed(ctx, message),
    "terminal.closed.event": (message) => handleTerminalClosedEvent(message),
    "terminal.output": (message) => handleTerminalOutput(message),
    "terminal.exited": (message) => handleTerminalExited(ctx, message),
    "terminal.error": (message) => handleTerminalError(ctx, message),
    "browser.opened": (message) => handleBrowserOpened(ctx, message),
    "browser.closed": (message) => handleBrowserClosed(ctx, message),
    "browser.error": (message) => handleBrowserError(ctx, message),
    "browser.framePolicyWarning": (message) =>
      useGatewayBrowserStore().setFrameWarning(message.sessionId, message.value),
    error: (message) => handleRealtimeError(ctx, message),
    pong: (message) => ctx.acknowledgePong(message.nonce),
  } satisfies {
    [K in keyof RealtimeServerMessageMap]?: RealtimeMessageHandler<K>;
  };
}

function handleBrowserOpened(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["browser.opened"],
) {
  useGatewayBrowserStore().upsertSession(message.session);
  ctx.resolveRequest(message);
}

function handleBrowserClosed(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["browser.closed"],
) {
  useGatewayBrowserStore().removeSession(message.sessionId);
  ctx.resolveRequest(message);
}

function handleBrowserError(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["browser.error"],
) {
  if (message.requestId) ctx.rejectRequest(message.requestId, new Error(message.message));
  useGatewayStore().setError(message.message);
}

function handlePublishedNotification(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["notification.published"],
) {
  projectPublishedNotification(message.notification);
  const action = notificationAction(message.notification);
  toast.info(message.notification.title, {
    id: message.notification.key,
    description: message.notification.body,
    duration: 10_000,
    action: {
      label: ctx.t(action.labelKey),
      onClick: action.run,
    },
  });
}

function handleReady(ctx: RealtimeServerMessageHandlerContext) {
  const wasAlreadyReady = ctx.readyCount() > 0;
  ctx.markReady();
  ctx.resubscribe();
  void ctx.restoreTerminalSessions();
  if (wasAlreadyReady) {
    ctx.refreshPinnedThreads();
    ctx.refreshSelectedThreadAfterReconnect();
  }
}

function handleGoalUpdated(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["thread.goal.updated"],
) {
  useGatewayComposerStore().upsertThreadGoal(message.hostId, message.threadId, message.goal);
  ctx.resolveRequest(message);
}

function handleGoalCleared(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["thread.goal.cleared"],
) {
  useGatewayComposerStore().clearThreadGoalState(message.hostId, message.threadId);
  ctx.resolveRequest(message);
}

function handleGoalSnapshot(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["thread.goal.snapshot"],
) {
  const composer = useGatewayComposerStore();
  if (message.goal) {
    composer.upsertThreadGoal(message.hostId, message.threadId, message.goal);
  } else {
    composer.clearThreadGoalState(message.hostId, message.threadId);
  }
  ctx.resolveRequest(message);
}

function handleTerminalOpened(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["terminal.opened"],
) {
  useGatewayTerminalStore().upsertTerminalSession(message.session);
  ctx.resolveRequest(message);
}

function handleTerminalSnapshot(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["terminal.snapshot"],
) {
  useGatewayTerminalStore().replaceTerminalSessions(message.sessions);
  ctx.resolveRequest(message);
}

function handleTerminalClosed(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["terminal.closed"],
) {
  useGatewayTerminalStore().removeTerminalSession(message.sessionId);
  ctx.resolveRequest(message);
}

function handleTerminalClosedEvent(message: RealtimeServerMessageMap["terminal.closed.event"]) {
  useGatewayTerminalStore().removeTerminalSession(message.sessionId);
}

function handleTerminalOutput(message: RealtimeServerMessageMap["terminal.output"]) {
  useGatewayTerminalStore().appendTerminalOutput(message.sessionId, message.data);
}

function handleTerminalExited(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["terminal.exited"],
) {
  useGatewayTerminalStore().markTerminalExited(message.sessionId, ctx.t("app.terminalExited"));
}

function handleTerminalError(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["terminal.error"],
) {
  const terminal = useGatewayTerminalStore();
  if (message.sessionId) {
    terminal.markTerminalExited(message.sessionId, message.message);
  }
  if (message.requestId) {
    ctx.rejectRequest(message.requestId, new Error(message.message));
  }
  useGatewayStore().setError(message.message);
}

function handleRealtimeError(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["error"],
) {
  const requestError = realtimeRequestErrorFromServer(
    message.message,
    message.request && "requestId" in message.request ? message.request : undefined,
    message.details ?? {},
  );
  if (message.requestId) {
    ctx.rejectRequest(message.requestId, requestError);
  }
  if (message.code && locallyRecoveredRequestErrorCodes.has(message.code)) {
    return;
  }
  useGatewayStore().setError(requestError.message, {
    hostId: message.request && "hostId" in message.request ? message.request.hostId : null,
    threadId: message.request && "threadId" in message.request ? message.request.threadId : null,
  });
}

function handleThreadEvent(ctx: RealtimeServerMessageHandlerContext, event: GatewayEvent) {
  const views = useGatewayThreadViewStore();
  const lastAppliedEventId = views.lastAppliedThreadEventId(event.hostId, event.threadId);
  if (event.id <= lastAppliedEventId) {
    return;
  }
  views.queueThreadEvent(event);
  ctx.advanceThreadSubscriptionCursor(event);
}

function handleHostLifecycle(
  ctx: RealtimeServerMessageHandlerContext,
  event: RealtimeServerMessageMap["host.lifecycle"]["event"],
) {
  const gateway = useGatewayStore();
  const eventTime = event.createdAt ? Date.parse(event.createdAt) : Date.now();
  const current = gateway.hostConnectionStatuses[event.hostId];
  if (current?.updatedAt && Number.isFinite(eventTime) && eventTime < current.updatedAt) {
    return;
  }
  gateway.hostConnectionStatuses = {
    ...gateway.hostConnectionStatuses,
    [event.hostId]: {
      status: event.status,
      message: event.message,
      updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now(),
    },
  };
  const notifyKey = `${event.hostId}:${event.status}:${event.message}`;
  if (
    (event.status === "upgrading" || event.status === "restarting") &&
    !ctx.lifecycleNotificationKeys.has(notifyKey)
  ) {
    ctx.lifecycleNotificationKeys.add(notifyKey);
    toast.info(event.message);
  }
}
