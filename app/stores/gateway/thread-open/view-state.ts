import { writeGatewayLastOpenThreadSelection, writeGatewayRouteSelection } from "../route-state";
import type { GatewayStoreContext } from "../types";
import {
  activateThreadViewFromCache,
  clearSelectedThreadView,
  saveSelectedThreadView,
} from "./thread-view-cache";

export function beginViewTransition(ctx: GatewayStoreContext) {
  ctx.state.viewEpoch += 1;
  return ctx.state.viewEpoch;
}

export function isCurrentViewTransition(ctx: GatewayStoreContext, epoch: number) {
  return ctx.state.viewEpoch === epoch;
}

export function cacheSelectedThreadView(ctx: GatewayStoreContext) {
  saveSelectedThreadView(ctx);
}

export function restoreThreadView(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  return activateThreadViewFromCache(ctx, hostId, threadId);
}

export function clearCurrentThreadView(ctx: GatewayStoreContext) {
  clearSelectedThreadView(ctx);
}

export function rememberOpenThread(ctx: GatewayStoreContext, threadId: string) {
  if (!ctx.state.selectedHostId) {
    return;
  }
  const nextLastOpenThread = {
    hostId: ctx.state.selectedHostId,
    projectId: ctx.state.selectedProjectId,
    threadId,
  };
  writeGatewayLastOpenThreadSelection(nextLastOpenThread);
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

export function activatePendingThreadView(
  ctx: GatewayStoreContext,
  hostId: number,
  projectId: number | null,
  threadId: string,
) {
  activateThreadView(ctx, hostId, projectId);
  ctx.state.selectedThreadId = threadId;
}
