import type { GatewayEvent } from "~~/shared/types";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext, ThreadViewState } from "../types";

export function threadViewKey(hostId: number, threadId: string) {
  return pinnedKey(hostId, threadId);
}

export function selectedThreadViewKey(ctx: GatewayStoreContext) {
  return ctx.state.selectedHostId && ctx.state.selectedThreadId
    ? threadViewKey(ctx.state.selectedHostId, ctx.state.selectedThreadId)
    : null;
}

export function selectedThreadView(ctx: GatewayStoreContext) {
  const key = selectedThreadViewKey(ctx);
  return key ? (ctx.state.threadViews[key] ?? null) : null;
}

export function upsertThreadView(ctx: GatewayStoreContext, view: ThreadViewState) {
  ctx.state.threadViews = {
    ...ctx.state.threadViews,
    [threadViewKey(view.hostId, view.threadId)]: view,
  };
}

export function patchThreadView(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  patch: Partial<ThreadViewState>,
) {
  const key = threadViewKey(hostId, threadId);
  const existing = ctx.state.threadViews[key] ?? emptyThreadView(hostId, threadId);
  const next = { ...existing, ...patch, hostId, threadId };
  upsertThreadView(ctx, next);
  if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
    activateThreadViewFromCache(ctx, hostId, threadId);
  }
  return next;
}

export function activateThreadViewFromCache(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
) {
  const view = ctx.state.threadViews[threadViewKey(hostId, threadId)];
  if (!view) {
    return false;
  }
  ctx.state.selectedHostId = view.hostId;
  ctx.state.selectedProjectId = view.projectId;
  ctx.state.selectedThreadId = view.threadId;
  ctx.state.currentThread = view.currentThread;
  ctx.state.history = view.history;
  ctx.state.events = [...view.events];
  ctx.state.olderTurnsCursor = view.olderTurnsCursor;
  ctx.state.newerTurnsCursor = view.newerTurnsCursor;
  ctx.state.lastEventId = view.lastEventId;
  return true;
}

export function saveSelectedThreadView(ctx: GatewayStoreContext) {
  if (
    !ctx.state.selectedHostId ||
    !ctx.state.selectedThreadId ||
    !ctx.state.currentThread ||
    !ctx.state.history
  ) {
    return;
  }
  upsertThreadView(ctx, {
    hostId: ctx.state.selectedHostId,
    projectId: ctx.state.selectedProjectId,
    threadId: ctx.state.selectedThreadId,
    currentThread: ctx.state.currentThread,
    history: ctx.state.history,
    events: [...ctx.state.events],
    olderTurnsCursor: ctx.state.olderTurnsCursor,
    newerTurnsCursor: ctx.state.newerTurnsCursor,
    lastEventId: ctx.state.lastEventId,
    loading: false,
    error: null,
  });
}

export function clearSelectedThreadView(ctx: GatewayStoreContext) {
  ctx.state.selectedThreadId = null;
  ctx.state.currentThread = null;
  ctx.state.history = null;
  ctx.state.events = [];
  ctx.state.olderTurnsCursor = null;
  ctx.state.newerTurnsCursor = null;
  ctx.state.lastEventId = 0;
}

export function removeThreadView(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const key = threadViewKey(hostId, threadId);
  const { [key]: _removed, ...threadViews } = ctx.state.threadViews;
  ctx.state.threadViews = threadViews;
}

export function appendEventToThreadView(ctx: GatewayStoreContext, event: GatewayEvent) {
  const key = threadViewKey(event.hostId, event.threadId);
  const view = ctx.state.threadViews[key];
  if (!view || event.id <= view.lastEventId) {
    return;
  }
  patchThreadView(ctx, event.hostId, event.threadId, {
    events: [...view.events, event].slice(-500),
    lastEventId: event.id,
  });
}

function emptyThreadView(hostId: number, threadId: string): ThreadViewState {
  return {
    hostId,
    projectId: null,
    threadId,
    currentThread: null,
    history: null,
    events: [],
    olderTurnsCursor: null,
    newerTurnsCursor: null,
    lastEventId: 0,
    loading: false,
    error: null,
  };
}
