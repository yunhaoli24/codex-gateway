import type { ThreadOpenResult } from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import { threadIdFromParams } from "../thread-utils/identity";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import type { GatewayStoreContext } from "../types";

export function applyOpenedThreadResult(
  ctx: GatewayStoreContext,
  threadId: string,
  result: ThreadOpenResult,
) {
  ctx.state.currentThread = result.thread;
  ctx.state.history = result.history;
  if (result.projectId) {
    ctx.state.selectedProjectId = result.projectId;
  }
  ctx.state.selectedThreadId = threadId;
  if (result.project) {
    ctx.mergeProjects([result.project]);
  }
  applyCommonThreadResult(ctx, threadId, result);
  for (const event of result.recentEvents) {
    ctx.applyLiveEvent(event, { notifyTerminal: false });
  }
  syncRuntimeStatusFromThread(ctx, result.thread, result.history);
  ctx.upsertPinnedMetadataFromThread(result.thread as any);
}

export function applyStartedThreadResult(ctx: GatewayStoreContext, result: ThreadOpenResult) {
  const thread = result.thread as any;
  const threadId = String(thread.id);
  ctx.state.currentThread = result.thread;
  ctx.state.history = result.history;
  ctx.state.selectedThreadId = threadId;
  applyCommonThreadResult(ctx, threadId, result);
  return threadId;
}

function applyCommonThreadResult(
  ctx: GatewayStoreContext,
  threadId: string,
  result: ThreadOpenResult,
) {
  if (!ctx.state.selectedHostId) {
    return;
  }
  ctx.state.events = result.recentEvents;
  ctx.state.olderTurnsCursor = result.turnsPage.nextCursor;
  ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor;
  ctx.state.lastEventId = result.recentEvents.at(-1)?.id ?? 0;
  ctx.setThreadSettings(ctx.state.selectedHostId, threadId, result.threadSettings);
  if (result.tokenUsage) {
    ctx.setThreadTokenUsage(ctx.state.selectedHostId, threadId, result.tokenUsage);
  } else {
    syncTokenUsageFromRecentEvents(ctx, result.recentEvents);
  }
  syncRuntimeStatusFromThread(ctx, result.thread, result.history);
}

function syncRuntimeStatusFromThread(ctx: GatewayStoreContext, thread: unknown, history: unknown) {
  const hostId = ctx.state.selectedHostId;
  const threadId = ctx.state.selectedThreadId;
  if (!hostId || !threadId) {
    return;
  }
  const status = runtimeStatusFromThreadState(thread, history);
  if (status) {
    ctx.setThreadStatus(hostId, threadId, status, { notifyTerminal: false });
  }
}

function syncTokenUsageFromRecentEvents(
  ctx: GatewayStoreContext,
  events: ThreadOpenResult["recentEvents"],
) {
  for (const event of events) {
    if (event.method !== "thread/tokenUsage/updated") {
      continue;
    }
    const params = (event.payload as any)?.params || {};
    const threadId = threadIdFromParams(params);
    const tokenUsage = normalizeTokenUsage(params.tokenUsage);
    if (threadId && event.hostId && tokenUsage) {
      ctx.setThreadTokenUsage(event.hostId, String(threadId), tokenUsage);
    }
  }
}
