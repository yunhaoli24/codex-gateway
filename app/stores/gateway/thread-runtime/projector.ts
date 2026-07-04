import type { ThreadRuntimeStatus } from "~~/shared/types";
import { activeRemoteTurnId } from "../thread-turns/active-turn";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, GatewayStoreState } from "../types";

export interface ThreadRuntimeProjection {
  key: string;
  status: ThreadRuntimeStatus;
  activeTurnId: string | null;
  canSteer: boolean;
  canInterrupt: boolean;
}

export interface ThreadRuntimeStatusInput {
  status: ThreadRuntimeStatus;
  turnId?: string | null;
}

export interface ActiveTerminalProcessInput {
  turnId: string;
  itemId: string;
  processId: string;
}

type ThreadRuntimeStateSource = Pick<
  GatewayStoreState,
  | "selectedHostId"
  | "selectedThreadId"
  | "currentThread"
  | "history"
  | "events"
  | "threadViews"
  | "threadStatuses"
  | "activeTurnIdsByThreadKey"
  | "activeTerminalProcessByThreadKey"
>;

export function projectThreadRuntime(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
): ThreadRuntimeProjection {
  return projectThreadRuntimeFromState(ctx.state, hostId, threadId);
}

export function projectThreadRuntimeFromState(
  state: ThreadRuntimeStateSource,
  hostId: number,
  threadId: string,
): ThreadRuntimeProjection {
  const key = pinnedKey(hostId, threadId);
  const status = effectiveRuntimeStatusFromState(state, state.threadStatuses[key]);
  const activeTurnId = activeTurnIdForStatusFromState(state, hostId, threadId, status);
  return {
    key,
    status,
    activeTurnId,
    canSteer: status === "running" && Boolean(activeTurnId),
    canInterrupt: status === "running" && Boolean(activeTurnId),
  };
}

export function effectiveRuntimeStatus(
  ctx: GatewayStoreContext,
  storedStatus: ThreadRuntimeStatus | undefined,
): ThreadRuntimeStatus {
  return effectiveRuntimeStatusFromState(ctx.state, storedStatus);
}

export function effectiveRuntimeStatusFromState(
  _state: ThreadRuntimeStateSource,
  storedStatus: ThreadRuntimeStatus | undefined,
): ThreadRuntimeStatus {
  return storedStatus ?? "idle";
}

export function applyThreadRuntimeStatus(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  input: ThreadRuntimeStatusInput,
) {
  const key = pinnedKey(hostId, threadId);
  const runningKeys = new Set(ctx.state.runningThreadKeys);
  const nextStatus = input.status;

  ctx.state.threadStatuses = {
    ...ctx.state.threadStatuses,
    [key]: nextStatus,
  };

  if (nextStatus === "running") {
    runningKeys.add(key);
    if (input.turnId) {
      ctx.state.activeTurnIdsByThreadKey = {
        ...ctx.state.activeTurnIdsByThreadKey,
        [key]: input.turnId,
      };
    }
  } else {
    // A terminal app-server status event is authoritative. Clear active turn
    // hints here so the composer cannot accidentally send the next message as
    // turn/steer after refresh, reconnect, or a delayed completed event.
    runningKeys.delete(key);
    removeActiveTurn(ctx, key);
    removeActiveTerminalProcess(ctx, key);
  }

  ctx.state.runningThreadKeys = [...runningKeys];
}

export function rememberThreadTerminalProcess(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  input: ActiveTerminalProcessInput,
) {
  const key = pinnedKey(hostId, threadId);
  ctx.state.activeTerminalProcessByThreadKey = {
    ...ctx.state.activeTerminalProcessByThreadKey,
    [key]: input,
  };
  applyThreadRuntimeStatus(ctx, hostId, threadId, {
    status: "running",
    turnId: input.turnId,
  });
}

export function clearThreadTerminalProcess(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  input: { turnId: string; itemId: string },
) {
  const key = pinnedKey(hostId, threadId);
  const active = ctx.state.activeTerminalProcessByThreadKey[key];
  if (!active || active.turnId !== input.turnId || active.itemId !== input.itemId) {
    return;
  }
  removeActiveTerminalProcess(ctx, key);
  // A command item finishing is not the same as the turn finishing. Keep the
  // thread running until app-server sends turn/completed or backend refresh
  // records an authoritative terminal thread status.
}

function activeTurnIdForStatusFromState(
  state: ThreadRuntimeStateSource,
  hostId: number,
  threadId: string,
  status: ThreadRuntimeStatus,
) {
  if (status !== "running") {
    return null;
  }
  const key = pinnedKey(hostId, threadId);
  // Stored app-server status is the gate. History can contain stale inProgress
  // items after reconnect, so history is only a source for the turn id once the
  // thread is already known to be running.
  return (
    state.activeTurnIdsByThreadKey[key] ??
    state.activeTerminalProcessByThreadKey[key]?.turnId ??
    activeRemoteTurnId(historyForThread(state, hostId, threadId)) ??
    null
  );
}

function historyForThread(state: ThreadRuntimeStateSource, hostId: number, threadId: string) {
  if (state.selectedHostId === hostId && state.selectedThreadId === threadId) {
    return state.history;
  }
  const key = pinnedKey(hostId, threadId);
  return state.threadViews[key]?.history ?? null;
}

function removeActiveTurn(ctx: GatewayStoreContext, key: string) {
  const { [key]: _removed, ...remaining } = ctx.state.activeTurnIdsByThreadKey;
  ctx.state.activeTurnIdsByThreadKey = remaining;
}

function removeActiveTerminalProcess(ctx: GatewayStoreContext, key: string) {
  const { [key]: _removed, ...remaining } = ctx.state.activeTerminalProcessByThreadKey;
  ctx.state.activeTerminalProcessByThreadKey = remaining;
}
