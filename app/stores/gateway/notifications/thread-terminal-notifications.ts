import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, ThreadRuntimeStatus } from "../types";
import { notifyOnce } from "./notification-center";

const MAX_NOTIFICATION_THREAD_TITLE_LENGTH = 80;

export interface ThreadTerminalNotificationOptions {
  turnId?: string | null;
}

export function notifyThreadTerminalStatus(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  status: ThreadRuntimeStatus,
  options: ThreadTerminalNotificationOptions = {},
) {
  if (!import.meta.client || status === "running" || status === "idle") {
    return;
  }

  const threadKey = pinnedKey(hostId, threadId);
  const hostName = ctx.state.hosts.find((host) => host.id === hostId)?.name ?? String(hostId);
  notifyOnce(ctx, {
    key: threadTerminalNotificationKey(threadKey, status, options.turnId),
    title: ctx.t("app.threadFinishedNotificationTitle", {
      thread: notificationThreadTitle(ctx, hostId, threadId),
    }),
    body: ctx.t("app.threadFinishedNotificationBody", {
      host: hostName,
      status: ctx.t(statusLabelKey(status)),
    }),
  });
}

function notificationThreadTitle(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const threadKey = pinnedKey(hostId, threadId);
  const candidates = [
    hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId
      ? ctx.state.currentThread
      : null,
    ctx.state.threads.find((thread) => String(thread?.id) === threadId),
    ctx.state.gatewayConfig.pinnedThreads.find(
      (thread) => pinnedKey(thread.hostId, thread.threadId) === threadKey,
    ),
  ];

  for (const candidate of candidates) {
    const title = titleFromThreadCandidate(candidate);
    if (title) {
      return truncateTitle(title);
    }
  }
  return threadId;
}

function titleFromThreadCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const thread = candidate as Record<string, unknown>;
  for (const key of ["title", "name", "preview", "threadId", "id"]) {
    const value = thread[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function truncateTitle(title: string) {
  if (title.length <= MAX_NOTIFICATION_THREAD_TITLE_LENGTH) {
    return title;
  }
  return `${title.slice(0, MAX_NOTIFICATION_THREAD_TITLE_LENGTH - 1)}…`;
}

function statusLabelKey(status: ThreadRuntimeStatus) {
  const labels: Record<ThreadRuntimeStatus, string> = {
    idle: "app.idle",
    running: "app.running",
    completed: "app.completed",
    failed: "app.failed",
    interrupted: "app.interrupted",
  };
  return labels[status];
}

function threadTerminalNotificationKey(
  threadKey: string,
  status: ThreadRuntimeStatus,
  turnId?: string | null,
) {
  return turnId
    ? `thread-terminal:${threadKey}:turn:${turnId}:${status}`
    : `thread-terminal:${threadKey}:status:${status}`;
}
