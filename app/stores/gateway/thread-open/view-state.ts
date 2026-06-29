import { writeGatewayRouteSelection } from "../route-state";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export function beginViewTransition(ctx: GatewayStoreContext) {
  ctx.state.viewEpoch += 1;
  return ctx.state.viewEpoch;
}

export function isCurrentViewTransition(ctx: GatewayStoreContext, epoch: number) {
  return ctx.state.viewEpoch === epoch;
}

export function cacheSelectedThreadSnapshot(ctx: GatewayStoreContext) {
  if (
    !ctx.state.selectedHostId ||
    !ctx.state.selectedThreadId ||
    !ctx.state.currentThread ||
    !ctx.state.history
  ) {
    return;
  }
  ctx.state.threadSnapshots[pinnedKey(ctx.state.selectedHostId, ctx.state.selectedThreadId)] = {
    hostId: ctx.state.selectedHostId,
    projectId: ctx.state.selectedProjectId,
    threadId: ctx.state.selectedThreadId,
    currentThread: ctx.state.currentThread,
    history: ctx.state.history,
    events: [...ctx.state.events],
    olderTurnsCursor: ctx.state.olderTurnsCursor,
    newerTurnsCursor: ctx.state.newerTurnsCursor,
    lastEventId: ctx.state.lastEventId,
  };
}

export function restoreThreadSnapshot(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const snapshot = ctx.state.threadSnapshots[pinnedKey(hostId, threadId)];
  if (!snapshot) {
    return false;
  }
  ctx.state.selectedHostId = snapshot.hostId;
  ctx.state.selectedProjectId = snapshot.projectId;
  ctx.state.selectedThreadId = snapshot.threadId;
  ctx.state.currentThread = snapshot.currentThread;
  ctx.state.history = snapshot.history;
  ctx.state.events = [...snapshot.events];
  ctx.state.olderTurnsCursor = snapshot.olderTurnsCursor;
  ctx.state.newerTurnsCursor = snapshot.newerTurnsCursor;
  ctx.state.lastEventId = snapshot.lastEventId;
  return true;
}

export function clearCurrentThreadView(ctx: GatewayStoreContext) {
  ctx.state.selectedThreadId = null;
  ctx.state.currentThread = null;
  ctx.state.history = null;
  ctx.state.events = [];
  ctx.state.olderTurnsCursor = null;
  ctx.state.newerTurnsCursor = null;
  ctx.state.lastEventId = 0;
}

export function rememberOpenThread(ctx: GatewayStoreContext, threadId: string) {
  if (!ctx.state.selectedHostId) {
    return;
  }
  ctx.state.gatewayConfig.lastOpenThread = {
    hostId: ctx.state.selectedHostId,
    projectId: ctx.state.selectedProjectId,
    threadId,
  };
  ctx.persistConfig();
}

export function requestScrollToLatest(ctx: GatewayStoreContext) {
  ctx.state.scrollToLatestToken += 1;
}

export function syncSelectedRoute(ctx: GatewayStoreContext, options: { replace?: boolean } = {}) {
  writeGatewayRouteSelection(
    {
      hostId: ctx.state.selectedHostId,
      projectId: ctx.state.selectedProjectId,
      threadId: ctx.state.selectedThreadId,
    },
    options,
  );
}

export function activateThreadView(
  ctx: GatewayStoreContext,
  hostId: number,
  projectId: number | null,
) {
  ctx.state.selectedHostId = hostId;
  ctx.state.selectedProjectId = projectId;
  clearCurrentThreadView(ctx);
}
