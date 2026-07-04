import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import { applyAppServerEventToHistory } from "~~/shared/thread-history/app-server-events";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import type { ThreadOpenSnapshot } from "./types";

type SnapshotEventReducer = (
  snapshot: ThreadOpenSnapshot,
  params: Record<string, any>,
) => ThreadOpenSnapshot;

const snapshotEventReducers: Record<string, SnapshotEventReducer> = {
  "thread/status/changed": (snapshot, params) =>
    updateSnapshotThreadStatus(snapshot, params.status),
  "thread/settings/updated": (snapshot, params) => ({
    ...snapshot,
    threadSettings: {
      model: params.threadSettings?.model ?? null,
      effort: params.threadSettings?.effort ?? null,
      approvalPolicy: params.threadSettings?.approvalPolicy ?? null,
    },
  }),
  "thread/tokenUsage/updated": (snapshot, params) => ({
    ...snapshot,
    tokenUsage: normalizeTokenUsage(params.tokenUsage) ?? snapshot.tokenUsage,
  }),
};

export function applyEventToOpenSnapshot(
  snapshot: ThreadOpenSnapshot | null,
  method: string,
  payload: any,
  createdAt?: string | null,
) {
  if (!snapshot) {
    return snapshot;
  }

  const params = payload?.params ?? {};
  const history = trimSnapshotHistory(
    applyAppServerEventToHistory({
      history: snapshot.history,
      currentThread: snapshot.thread,
      threadId: String(params.threadId ?? snapshotThread(snapshot).id ?? ""),
      method,
      payload,
      createdAt,
    }),
  );
  let nextSnapshot = withSnapshotHistory(snapshot, history);
  nextSnapshot = snapshotEventReducers[method]?.(nextSnapshot, params) ?? nextSnapshot;
  return nextSnapshot;
}

function trimSnapshotHistory(history: unknown) {
  if (!history || typeof history !== "object") {
    return history;
  }
  const thread = (history as any).thread;
  if (!thread || typeof thread !== "object" || !Array.isArray(thread.turns)) {
    return history;
  }
  return {
    ...(history as Record<string, unknown>),
    thread: {
      ...thread,
      turns: thread.turns.slice(-SERVER_TURN_CACHE_LIMIT),
    },
  };
}

function updateSnapshotThreadStatus(snapshot: ThreadOpenSnapshot, status: unknown) {
  const value = statusValue(status);
  if (!value) {
    return snapshot;
  }
  return withSnapshotHistory(snapshot, {
    ...(snapshot.history as any),
    thread: {
      ...snapshotThread(snapshot),
      status: value,
    },
  });
}

function withSnapshotHistory(snapshot: ThreadOpenSnapshot, history: unknown): ThreadOpenSnapshot {
  const thread = snapshotHistoryThread(history) ?? snapshotThread(snapshot);
  return {
    ...snapshot,
    history,
    thread: {
      ...(snapshot.thread as any),
      ...(isNestedThread(snapshot.thread) ? { thread } : thread),
    },
  };
}

function snapshotHistoryThread(history: unknown) {
  const thread = (history as any)?.thread;
  return thread && typeof thread === "object" ? thread : null;
}

function snapshotThread(snapshot: ThreadOpenSnapshot) {
  const historyThread = snapshotHistoryThread(snapshot.history);
  if (historyThread) {
    return historyThread;
  }
  const thread = isNestedThread(snapshot.thread)
    ? (snapshot.thread as any).thread
    : snapshot.thread;
  return thread && typeof thread === "object" ? thread : { id: "" };
}

function isNestedThread(thread: unknown) {
  return Boolean(thread && typeof thread === "object" && (thread as any).thread);
}

function statusValue(status: unknown) {
  if (typeof status === "string") {
    return status;
  }
  if (status && typeof status === "object" && typeof (status as any).type === "string") {
    return (status as any).type;
  }
  return null;
}
