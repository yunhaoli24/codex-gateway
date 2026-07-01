import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import type { ThreadOpenSnapshot } from "./types";

export function applyEventToOpenSnapshot(
  snapshot: ThreadOpenSnapshot | null,
  method: string,
  payload: any,
) {
  if (!snapshot) {
    return snapshot;
  }
  const params = payload?.params ?? payload;
  if (method === "turn/started" && params?.turn) {
    return upsertSnapshotTurn(snapshot, params.turn, "inProgress");
  }
  if (method === "turn/completed" && params?.turn) {
    return upsertSnapshotTurn(snapshot, params.turn, terminalTurnStatus(params.turn.status));
  }
  if (method === "thread/status/changed") {
    return updateSnapshotThreadStatus(snapshot, params?.status);
  }
  return snapshot;
}

function upsertSnapshotTurn(
  snapshot: ThreadOpenSnapshot,
  turn: Record<string, any>,
  fallbackStatus: string,
) {
  const thread = snapshotThread(snapshot);
  const turns = Array.isArray(thread.turns) ? [...thread.turns] : [];
  const nextTurn = {
    ...turn,
    status: statusValue(turn.status) ?? fallbackStatus,
  };
  const index = turns.findIndex((candidate: any) => candidate?.id && candidate.id === turn.id);
  if (index >= 0) {
    turns[index] = mergeTurn(turns[index], nextTurn);
  } else {
    turns.push(nextTurn);
  }
  return withSnapshotThread(snapshot, {
    ...thread,
    turns: turns.slice(-SERVER_TURN_CACHE_LIMIT),
  });
}

function updateSnapshotThreadStatus(snapshot: ThreadOpenSnapshot, status: unknown) {
  const value = statusValue(status);
  if (!value) {
    return snapshot;
  }
  return withSnapshotThread(snapshot, {
    ...snapshotThread(snapshot),
    status: value,
  });
}

function withSnapshotThread(snapshot: ThreadOpenSnapshot, thread: Record<string, any>) {
  return {
    ...snapshot,
    history: {
      ...(snapshot.history as any),
      thread,
    },
    thread: {
      ...(snapshot.thread as any),
      ...(isNestedThread(snapshot.thread) ? { thread } : thread),
    },
  };
}

function snapshotThread(snapshot: ThreadOpenSnapshot) {
  const historyThread = (snapshot.history as any)?.thread;
  if (historyThread && typeof historyThread === "object") {
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

function mergeTurn(existing: Record<string, any>, incoming: Record<string, any>) {
  return {
    ...existing,
    ...incoming,
    items: mergeItems(existing.items, incoming.items),
  };
}

function mergeItems(existing: unknown, incoming: unknown) {
  const currentItems = Array.isArray(existing) ? existing : [];
  const incomingItems = Array.isArray(incoming) ? incoming : [];
  if (!incomingItems.length) {
    return currentItems;
  }
  const byId = new Map<string, any>();
  const anonymous: any[] = [];
  for (const item of currentItems) {
    const id = item?.id ? String(item.id) : null;
    if (id) {
      byId.set(id, item);
    } else {
      anonymous.push(item);
    }
  }
  for (const item of incomingItems) {
    const id = item?.id ? String(item.id) : null;
    if (id) {
      byId.set(id, { ...byId.get(id), ...item });
    } else {
      anonymous.push(item);
    }
  }
  return [...anonymous, ...byId.values()];
}

function terminalTurnStatus(status: unknown) {
  const value = statusValue(status);
  if (value === "failed" || value === "interrupted") {
    return value;
  }
  return "completed";
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
