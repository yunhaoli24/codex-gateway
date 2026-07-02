import type { GatewayEvent, ThreadRuntimeStatus } from "./types";

export function isThreadActiveStatus(status: any) {
  const value = statusValue(status);
  return (
    value === "active" ||
    value === "inProgress" ||
    value === "in_progress" ||
    value === "running" ||
    value === "pending" ||
    value === "starting" ||
    value === "waitingForClient" ||
    value === "waitingForApproval"
  );
}

export function runtimeStatusFromAppThreadStatus(status: any): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "active" || value === "inProgress" || value === "running") return "running";
  if (value === "systemError" || value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function runtimeStatusFromTopLevelThreadState(thread: unknown): ThreadRuntimeStatus {
  return runtimeStatusFromAppThreadStatus(topLevelThreadStatus(thread) ?? { type: "idle" });
}

export function terminalTurnStatus(status: any): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function runtimeStatusFromThreadState(
  thread: unknown,
  history: unknown,
  events: GatewayEvent[] = [],
): ThreadRuntimeStatus | null {
  const eventStatus = runtimeStatusFromEvents(events);
  if (eventStatus) {
    return eventStatus;
  }

  const candidates: any[] = [];
  if (thread && typeof thread === "object") {
    candidates.push(thread);
  }
  if (history && typeof history === "object") {
    candidates.push((history as any).thread, history);
  }

  const turns = [
    ...(Array.isArray((history as any)?.thread?.turns) ? (history as any).thread.turns : []),
    ...(Array.isArray((history as any)?.turns) ? (history as any).turns : []),
    ...(Array.isArray((thread as any)?.turns) ? (thread as any).turns : []),
  ];
  candidates.push(...turns);

  if (turns.length) {
    const latestTurn = turns.at(-1);
    const latestTurnStatus = statusValue(latestTurn?.status);
    if (
      latestTurnStatus !== "failed" &&
      latestTurnStatus !== "interrupted" &&
      hasActiveItems(latestTurn)
    ) {
      return "running";
    }
    if (
      latestTurnStatus === "completed" ||
      latestTurnStatus === "failed" ||
      latestTurnStatus === "interrupted"
    ) {
      return terminalTurnStatus(latestTurnStatus);
    }
    if (isThreadActiveStatus(latestTurnStatus)) {
      return "running";
    }
  }
  const threadStatus = runtimeStatusFromTopLevelThreadStatus(
    (thread as any)?.status ?? (history as any)?.thread?.status ?? (history as any)?.status,
  );
  if (threadStatus) {
    return threadStatus;
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "failed")) {
    return "failed";
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "interrupted")) {
    return "interrupted";
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "completed")) {
    return "completed";
  }
  if (candidates.some((candidate) => isThreadActiveStatus(candidate?.status))) {
    return "running";
  }
  return null;
}

export function isTerminalOrIdleThreadStatus(status: any) {
  const runtimeStatus = runtimeStatusFromTopLevelThreadStatus(status);
  return Boolean(runtimeStatus && runtimeStatus !== "running");
}

function runtimeStatusFromEvents(events: GatewayEvent[]): ThreadRuntimeStatus | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const params = (event.payload as any)?.params ?? event.payload;
    if (event.method === "turn/started") {
      return "running";
    }
    if (event.method === "turn/completed") {
      return terminalTurnStatus(params?.turn?.status);
    }
    if (event.method === "thread/status/changed") {
      return runtimeStatusFromAppThreadStatus(params?.status);
    }
  }
  return null;
}

function runtimeStatusFromTopLevelThreadStatus(status: any): ThreadRuntimeStatus | null {
  const value = statusValue(status);
  if (value === "active" || value === "inProgress" || value === "running") {
    return "running";
  }
  if (value === "systemError" || value === "failed") {
    return "failed";
  }
  if (value === "interrupted") {
    return "interrupted";
  }
  if (value === "completed" || value === "idle" || value === "notLoaded" || value === "inactive") {
    return "completed";
  }
  return null;
}

function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}

function topLevelThreadStatus(thread: unknown) {
  if (!thread || typeof thread !== "object") {
    return null;
  }
  const value = (thread as any).thread ?? thread;
  return value && typeof value === "object" ? (value as any).status : null;
}

function hasActiveItems(turn: any) {
  return (
    Array.isArray(turn?.items) && turn.items.some((item: any) => isThreadActiveStatus(item?.status))
  );
}
