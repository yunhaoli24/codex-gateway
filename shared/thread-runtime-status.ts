import type { GatewayEvent, ThreadRuntimeStatus } from "./types";

type ThreadStatusLike = string | { type?: unknown } | null | undefined;

interface ThreadItemLike {
  type?: unknown;
  status?: ThreadStatusLike;
}

interface TurnLike {
  status?: ThreadStatusLike;
  items?: ThreadItemLike[];
}

interface ThreadContainerLike {
  status?: ThreadStatusLike;
  turns?: TurnLike[];
  thread?: ThreadContainerLike;
}

interface RuntimeStatusCandidate {
  status?: ThreadStatusLike;
}

type RuntimeStatusEventReducer = (
  event: GatewayEvent,
  params: Record<string, unknown>,
) => ThreadRuntimeStatus | null;

const ACTIVE_STATUS_VALUES = new Set([
  "active",
  "inProgress",
  "in_progress",
  "running",
  "pending",
  "starting",
  "waitingForClient",
  "waitingForApproval",
]);

const TERMINAL_STATUS_VALUES = new Set(["completed", "failed", "interrupted"]);
const COMPLETED_THREAD_VALUES = new Set(["completed", "idle", "notLoaded", "inactive"]);
const POST_TURN_ACTIVE_ITEM_TYPES = new Set(["contextCompaction", "sleep"]);
const RUNTIME_STATUS_EVENT_REDUCERS: Record<string, RuntimeStatusEventReducer> = {
  "turn/started": () => "running",
  "turn/completed": (_event, params) =>
    runtimeStatusFromCompletedTurn(recordField(params, "turn")),
  "thread/status/changed": (_event, params) =>
    runtimeStatusFromAppThreadStatus(recordField(params, "status")),
};

export function isThreadActiveStatus(status: unknown) {
  const value = statusValue(status);
  return Boolean(value && ACTIVE_STATUS_VALUES.has(value));
}

export function runtimeStatusFromAppThreadStatus(status: unknown): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "active" || value === "inProgress" || value === "running") return "running";
  if (value === "systemError" || value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function runtimeStatusFromTopLevelThreadState(thread: unknown): ThreadRuntimeStatus {
  return runtimeStatusFromAppThreadStatus(topLevelThreadStatus(thread) ?? { type: "idle" });
}

export function runtimeStatusFromSnapshotState(
  thread: unknown,
  history: unknown,
): ThreadRuntimeStatus | null {
  return runtimeStatusFromThreadSnapshot(thread, history);
}

export function terminalTurnStatus(status: unknown): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function runtimeStatusFromCompletedTurn(turn: unknown): ThreadRuntimeStatus {
  const completedTurn = asTurnLike(turn) ?? undefined;
  const value = statusValue(completedTurn?.status);
  if (value === "completed" && hasPostTurnActiveItems(completedTurn)) {
    return "running";
  }
  if (value && TERMINAL_STATUS_VALUES.has(value)) {
    return terminalTurnStatus(value);
  }
  if (completedTurn && (hasActiveItems(completedTurn) || isThreadActiveStatus(completedTurn.status))) {
    return "running";
  }
  return "completed";
}

export function runtimeStatusFromThreadState(
  thread: unknown,
  history: unknown,
  events: GatewayEvent[] = [],
): ThreadRuntimeStatus | null {
  const latestTurnTerminalStatus = terminalStatusFromLatestTurn(thread, history);
  if (latestTurnTerminalStatus) {
    return latestTurnTerminalStatus;
  }
  const eventStatus = runtimeStatusFromEvents(events);
  if (eventStatus) {
    return eventStatus;
  }

  return runtimeStatusFromThreadSnapshot(thread, history);
}

export function isTerminalOrIdleThreadStatus(status: unknown) {
  const runtimeStatus = runtimeStatusFromTopLevelThreadStatus(status);
  return Boolean(runtimeStatus && runtimeStatus !== "running");
}

function runtimeStatusFromThreadSnapshot(
  thread: unknown,
  history: unknown,
): ThreadRuntimeStatus | null {
  const candidates = candidateThreadStates(thread, history);
  const turns = turnsFromThreadState(thread, history);

  const latestTurn = turns.at(-1);
  const latestTurnStatus = statusValue(latestTurn?.status);
  if (latestTurnStatus && TERMINAL_STATUS_VALUES.has(latestTurnStatus)) {
    if (latestTurnStatus === "completed" && hasPostTurnActiveItems(latestTurn)) {
      return "running";
    }
    return terminalTurnStatus(latestTurnStatus);
  }
  if (latestTurn && (hasActiveItems(latestTurn) || isThreadActiveStatus(latestTurn.status))) {
    return "running";
  }

  const threadStatus = runtimeStatusFromTopLevelThreadStatus(
    nestedThreadState(thread)?.status ?? nestedThreadState(history)?.status,
  );
  if (threadStatus) {
    return threadStatus;
  }
  if (candidates.some((candidate) => statusValue(candidate.status) === "failed")) {
    return "failed";
  }
  if (candidates.some((candidate) => statusValue(candidate.status) === "interrupted")) {
    return "interrupted";
  }
  if (candidates.some((candidate) => statusValue(candidate.status) === "completed")) {
    return "completed";
  }
  if (candidates.some((candidate) => isThreadActiveStatus(candidate.status))) {
    return "running";
  }
  return null;
}

function terminalStatusFromLatestTurn(
  thread: unknown,
  history: unknown,
): ThreadRuntimeStatus | null {
  const latestTurn = turnsFromThreadState(thread, history).at(-1);
  const latestTurnStatus = statusValue(latestTurn?.status);
  if (!latestTurnStatus || !TERMINAL_STATUS_VALUES.has(latestTurnStatus)) {
    return null;
  }
  if (latestTurnStatus === "completed" && hasPostTurnActiveItems(latestTurn)) {
    return null;
  }
  return terminalTurnStatus(latestTurnStatus);
}

function runtimeStatusFromEvents(events: GatewayEvent[]): ThreadRuntimeStatus | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const status = runtimeStatusFromEvent(events[index]);
    if (status) {
      return status;
    }
  }
  return null;
}

function runtimeStatusFromEvent(event: GatewayEvent | undefined): ThreadRuntimeStatus | null {
  if (!event) {
    return null;
  }
  const params = eventParams(event);
  return RUNTIME_STATUS_EVENT_REDUCERS[event.method]?.(event, params) ?? null;
}

function runtimeStatusFromTopLevelThreadStatus(status: unknown): ThreadRuntimeStatus | null {
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
  if (value && COMPLETED_THREAD_VALUES.has(value)) {
    return "completed";
  }
  return null;
}

function candidateThreadStates(thread: unknown, history: unknown) {
  return [asThreadContainer(thread), asThreadContainer(history), nestedThreadState(history)]
    .filter((candidate): candidate is ThreadContainerLike => Boolean(candidate))
    .concat(turnsFromThreadState(thread, history)) as RuntimeStatusCandidate[];
}

function turnsFromThreadState(thread: unknown, history: unknown): TurnLike[] {
  return [
    ...turnsFromContainer(nestedThreadState(history)),
    ...turnsFromContainer(asThreadContainer(history)),
    ...turnsFromContainer(asThreadContainer(thread)),
  ];
}

function turnsFromContainer(container: ThreadContainerLike | null): TurnLike[] {
  return Array.isArray(container?.turns) ? container.turns.filter(isTurnLike) : [];
}

function nestedThreadState(value: unknown): ThreadContainerLike | null {
  const container = asThreadContainer(value);
  return asThreadContainer(container?.thread) ?? container;
}

function topLevelThreadStatus(thread: unknown) {
  return nestedThreadState(thread)?.status ?? null;
}

function statusValue(status: unknown) {
  if (typeof status === "string") {
    return status;
  }
  if (isRecord(status) && typeof status.type === "string") {
    return status.type;
  }
  return null;
}

function hasActiveItems(turn: TurnLike | undefined) {
  return Boolean(turn?.items?.some((item) => isThreadActiveStatus(item.status)));
}

function hasPostTurnActiveItems(turn: TurnLike | undefined) {
  return Boolean(
    turn?.items?.some((item) => {
      const type = typeof item.type === "string" ? item.type : "";
      return POST_TURN_ACTIVE_ITEM_TYPES.has(type) && isThreadActiveStatus(item.status);
    }),
  );
}

function eventParams(event: GatewayEvent) {
  const payload = isRecord(event.payload) ? event.payload : null;
  return isRecord(payload?.params) ? payload.params : (payload ?? {});
}

function recordField(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null;
  }
  return record[key];
}

function asThreadContainer(value: unknown): ThreadContainerLike | null {
  return isRecord(value) ? (value as ThreadContainerLike) : null;
}

function asTurnLike(value: unknown): TurnLike | null {
  return isRecord(value) ? (value as TurnLike) : null;
}

function isTurnLike(value: unknown): value is TurnLike {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
