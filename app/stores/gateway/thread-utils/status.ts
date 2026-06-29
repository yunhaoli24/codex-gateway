import type { ThreadRuntimeStatus } from "../types";

export function isThreadActiveStatus(status: any) {
  const value = statusValue(status);
  return value === "active" || value === "inProgress" || value === "running";
}

export function runtimeStatusFromAppThreadStatus(status: any): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "active" || value === "inProgress" || value === "running") return "running";
  if (value === "systemError" || value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
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
): ThreadRuntimeStatus | null {
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
  for (const turn of turns) {
    if (Array.isArray(turn?.items)) {
      candidates.push(...turn.items);
    }
  }

  const threadStatus = runtimeStatusFromTopLevelThreadStatus(
    (thread as any)?.status ?? (history as any)?.thread?.status ?? (history as any)?.status,
  );
  if (threadStatus) {
    return threadStatus;
  }
  if (turns.length) {
    const latestTurn = turns.at(-1);
    const latestTurnStatus = statusValue(latestTurn?.status);
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
