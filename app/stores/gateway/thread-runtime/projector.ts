import type { ThreadRuntimeStatus } from "~~/shared/types";
import { activeRemoteTurnId } from "../thread-turns/active-turn";
import { pinnedKey } from "../thread-utils/identity";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import type { GatewayStoreContext } from "../types";

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

export function projectThreadRuntime(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
): ThreadRuntimeProjection {
  const key = pinnedKey(hostId, threadId);
  const status = effectiveRuntimeStatus(ctx, hostId, threadId, ctx.state.threadStatuses[key]);
  const activeTurnId = activeTurnIdForStatus(ctx, hostId, threadId, status);
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
  hostId: number,
  threadId: string,
  storedStatus: ThreadRuntimeStatus | undefined,
): ThreadRuntimeStatus {
  const historyStatus = runtimeStatusFromThreadState(
    currentThreadForThread(ctx, hostId, threadId),
    historyForThread(ctx, hostId, threadId),
    eventsForThread(ctx, hostId, threadId),
  );
  if (storedStatus === "running" && activeRemoteTurnId(historyForThread(ctx, hostId, threadId))) {
    return "running";
  }
  if (storedStatus === "running" && historyStatus && historyStatus !== "running") {
    return historyStatus;
  }
  return storedStatus ?? historyStatus ?? "idle";
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

function activeTurnIdForStatus(
  ctx: GatewayStoreContext,
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
    ctx.state.activeTurnIdsByThreadKey[key] ??
    ctx.state.activeTerminalProcessByThreadKey[key]?.turnId ??
    activeRemoteTurnId(historyForThread(ctx, hostId, threadId)) ??
    null
  );
}

function historyForThread(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
    return ctx.state.history;
  }
  const key = pinnedKey(hostId, threadId);
  return ctx.state.threadViews[key]?.history ?? null;
}

function currentThreadForThread(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
    return ctx.state.currentThread;
  }
  const key = pinnedKey(hostId, threadId);
  return ctx.state.threadViews[key]?.currentThread ?? null;
}

function eventsForThread(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
    return ctx.state.events;
  }
  const key = pinnedKey(hostId, threadId);
  return ctx.state.threadViews[key]?.events ?? [];
}

function removeActiveTurn(ctx: GatewayStoreContext, key: string) {
  const { [key]: _removed, ...remaining } = ctx.state.activeTurnIdsByThreadKey;
  ctx.state.activeTurnIdsByThreadKey = remaining;
}

function removeActiveTerminalProcess(ctx: GatewayStoreContext, key: string) {
  const { [key]: _removed, ...remaining } = ctx.state.activeTerminalProcessByThreadKey;
  ctx.state.activeTerminalProcessByThreadKey = remaining;
}
