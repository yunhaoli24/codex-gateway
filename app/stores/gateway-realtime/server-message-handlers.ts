import { match, P } from "ts-pattern";
import type { RealtimeServerMessage } from "~~/shared/types";
import { STALE_THREAD_CURSOR_ERROR_CODE } from "~~/shared/gateway-errors";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import { realtimeRequestErrorFromServer } from "./request-errors";
import { createNotificationRealtimeHandlers } from "./handlers/notifications";
import { createBrowserRealtimeHandlers } from "./handlers/browser";
import { createTerminalRealtimeHandlers } from "./handlers/terminal";
import { createThreadRealtimeHandlers } from "./handlers/thread";
import { createHostMetricsRealtimeHandlers } from "./handlers/host-metrics";
import { createTmuxSessionsRealtimeHandlers } from "./handlers/tmux-sessions";
import type {
  RealtimeServerMessageHandlerContext,
  RealtimeServerMessageMap,
} from "./handlers/types";

export type {
  RealtimeServerMessageHandlerContext,
  RealtimeServerMessageMap,
} from "./handlers/types";

const locallyRecoveredRequestErrorCodes = new Set([STALE_THREAD_CURSOR_ERROR_CODE]);

export function createRealtimeServerMessageDispatcher(ctx: RealtimeServerMessageHandlerContext) {
  const thread = createThreadRealtimeHandlers(ctx);
  const terminal = createTerminalRealtimeHandlers(ctx);
  const browser = createBrowserRealtimeHandlers(ctx);
  const notifications = createNotificationRealtimeHandlers(ctx);
  const hostMetrics = createHostMetricsRealtimeHandlers(ctx);
  const tmuxSessions = createTmuxSessionsRealtimeHandlers(ctx);

  return (message: RealtimeServerMessage) =>
    match(message)
      .with({ type: "thread.event" }, thread["thread.event"])
      .with({ type: "thread.runtime.snapshot" }, thread["thread.runtime.snapshot"])
      .with({ type: "thread.runtime.updated" }, thread["thread.runtime.updated"])
      .with({ type: "thread.events.gap" }, thread["thread.events.gap"])
      .with({ type: "thread.goal.updated" }, thread["thread.goal.updated"])
      .with({ type: "thread.goal.cleared" }, thread["thread.goal.cleared"])
      .with({ type: "thread.goal.snapshot" }, thread["thread.goal.snapshot"])
      .with({ type: "terminal.opened" }, terminal["terminal.opened"])
      .with({ type: "terminal.snapshot" }, terminal["terminal.snapshot"])
      .with({ type: "terminal.closed" }, terminal["terminal.closed"])
      .with({ type: "terminal.closed.event" }, terminal["terminal.closed.event"])
      .with({ type: "terminal.output" }, terminal["terminal.output"])
      .with({ type: "terminal.exited" }, terminal["terminal.exited"])
      .with({ type: "terminal.error" }, terminal["terminal.error"])
      .with({ type: "browser.opened" }, browser["browser.opened"])
      .with({ type: "browser.closed" }, browser["browser.closed"])
      .with({ type: "browser.error" }, browser["browser.error"])
      .with({ type: "browser.framePolicyWarning" }, browser["browser.framePolicyWarning"])
      .with({ type: "browser.resourceFailed" }, browser["browser.resourceFailed"])
      .with({ type: "file.git.comparison" }, (response) => ctx.resolveRequest(response))
      .with({ type: "file.git.workspace.snapshot" }, (response) => ctx.resolveRequest(response))
      .with({ type: "file.search.results" }, (response) => ctx.resolveRequest(response))
      .with({ type: "file.watch.ready" }, (response) => ctx.resolveRequest(response))
      .with({ type: "project.defaults.snapshot" }, (response) => ctx.resolveRequest(response))
      .with({ type: "file.watch.changed" }, (event) =>
        gatewayDomainEvents.emit("remote-files-changed", {
          hostId: event.hostId,
          threadId: event.threadId,
          paths: event.paths,
        }),
      )
      .with({ type: "file.watch.closed" }, (event) =>
        gatewayDomainEvents.emit("file-watch-closed", event),
      )
      .with({ type: "notification.published" }, notifications["notification.published"])
      .with({ type: "host.lifecycle" }, notifications["host.lifecycle"])
      .with({ type: "host.metrics.snapshot" }, hostMetrics["host.metrics.snapshot"])
      .with({ type: "host.metrics.sample" }, hostMetrics["host.metrics.sample"])
      .with({ type: "host.metrics.status" }, hostMetrics["host.metrics.status"])
      .with({ type: "tmux.sessions.snapshot" }, tmuxSessions["tmux.sessions.snapshot"])
      .with({ type: "tmux.sessions.updated" }, tmuxSessions["tmux.sessions.updated"])
      .with({ type: "ready" }, () => handleReady(ctx))
      .with({ type: "config.pinnedThreads.changed" }, () =>
        gatewayDomainEvents.emit("pinned-threads-invalidated", {}),
      )
      .with({ type: "error" }, (error) => handleRealtimeError(ctx, error))
      .with({ type: "pong" }, ({ nonce }) => ctx.acknowledgePong(nonce))
      .with(
        {
          type: P.union(
            "thread.snapshot",
            "thread.started",
            "thread.turns.page",
            "thread.items.page",
            "turn.start.accepted",
            "turn.steer.accepted",
            "turn.interrupt.accepted",
            "turn.settings.updated",
            "mcp.status.snapshot",
            "mcp.event.stream.accepted",
            "serverRequest.respond.accepted",
          ),
        },
        (response) => ctx.resolveRequest(response),
      )
      .exhaustive();
}

function handleReady(ctx: RealtimeServerMessageHandlerContext) {
  const reconnect = ctx.readyCount() > 0;
  ctx.markReady();
  ctx.resubscribe();
  void ctx.restoreTerminalSessions();
  if (reconnect) {
    gatewayDomainEvents.emit("pinned-threads-invalidated", {});
    gatewayDomainEvents.emit("realtime-reconnected", {});
  }
}

function handleRealtimeError(
  ctx: RealtimeServerMessageHandlerContext,
  message: RealtimeServerMessageMap["error"],
) {
  const requestError = realtimeRequestErrorFromServer(
    message.message,
    message.request !== null && message.request !== undefined && "requestId" in message.request
      ? message.request
      : undefined,
    message.details ?? {},
  );
  if (message.requestId !== null && message.requestId !== undefined && message.requestId !== "") {
    const rejection = ctx.rejectRequest(message.requestId, requestError);
    // Pending promises do not imply that their feature renders errors. Each request explicitly
    // chooses whether failures are returned to an inline owner or published through Sonner.
    // Orphaned errors still notify globally because no caller remains to make them visible.
    if (rejection.delivered && !rejection.notify) return;
  }
  if (
    message.code !== null &&
    message.code !== undefined &&
    message.code !== "" &&
    locallyRecoveredRequestErrorCodes.has(message.code)
  )
    return;
  gatewayDomainEvents.emit("realtime-error-reported", {
    message: requestError.message,
    hostId:
      message.request !== null && message.request !== undefined && "hostId" in message.request
        ? message.request.hostId
        : null,
    threadId:
      message.request !== null && message.request !== undefined && "threadId" in message.request
        ? (message.request.threadId ?? null)
        : null,
  });
}
