import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import { applyStartedThreadResult, applyThreadSnapshotResult } from "../thread-open/hydration";
import { requestActivateThreadSnapshot, requestStartThread } from "../thread-open/transport";
import {
  activateThreadView,
  activatePendingThreadView,
  beginViewTransition,
  cacheSelectedThreadView,
  clearCurrentThreadView,
  isCurrentViewTransition,
  rememberOpenThread,
  requestScrollToLatest,
  restoreThreadView,
  syncSelectedRoute,
} from "../thread-open/view-state";
import { patchThreadView, upsertThreadView } from "../thread-open/thread-view-cache";

export function createThreadOpenActions(ctx: GatewayStoreContext) {
  return {
    beginViewTransition() {
      return beginViewTransition(ctx);
    },

    isCurrentViewTransition(epoch: number) {
      return isCurrentViewTransition(ctx, epoch);
    },

    cacheSelectedThreadView() {
      cacheSelectedThreadView(ctx);
    },

    restoreThreadView(hostId: number, threadId: string) {
      return restoreThreadView(ctx, hostId, threadId);
    },

    clearCurrentThreadView() {
      clearCurrentThreadView(ctx);
    },

    async rememberOpenThread(threadId: string) {
      await rememberOpenThread(ctx, threadId);
    },

    requestScrollToLatest() {
      requestScrollToLatest(ctx);
    },

    syncSelectedRoute(options: { replace?: boolean } = {}) {
      syncSelectedRoute(ctx, options);
    },

    async openThread(
      threadId: string,
      context?: { hostId?: number; projectId?: number | null; replaceRoute?: boolean },
    ) {
      ctx.cacheSelectedThreadView();
      const targetHostId = context?.hostId ?? ctx.state.selectedHostId;
      const targetProjectId =
        context && "projectId" in context
          ? (context.projectId ?? null)
          : ctx.state.selectedProjectId;
      if (!targetHostId) {
        return;
      }
      if (
        ctx.state.selectedHostId === targetHostId &&
        ctx.state.selectedThreadId === threadId &&
        ctx.state.currentThread &&
        ctx.state.history
      ) {
        await ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        void refreshGoalAfterOpen(ctx, targetHostId, threadId);
        ctx.requestScrollToLatest();
        return;
      }
      const viewEpoch = ctx.beginViewTransition();
      activatePendingThreadView(ctx, targetHostId, targetProjectId, threadId);
      if (ctx.restoreThreadView(targetHostId, threadId)) {
        syncRestoredThreadStatus(ctx, targetHostId, threadId);
        await ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        void refreshGoalAfterOpen(ctx, targetHostId, threadId);
        ctx.requestScrollToLatest();
        return;
      }

      await syncOpenThreadFromServer(ctx, {
        hostId: targetHostId,
        projectId: targetProjectId,
        threadId,
        viewEpoch,
        replaceRoute: context?.replaceRoute,
        showLoading: true,
      });
    },

    async openThreadPreview(
      hostId: number,
      threadId: string,
      context: { projectId?: number | null; limit?: number } = {},
    ) {
      const key = pinnedKey(hostId, threadId);
      const existing = ctx.state.threadViews[key];
      if (existing?.history && !existing.error) {
        ctx.connectEvents(hostId, threadId);
        return existing;
      }

      patchThreadView(ctx, hostId, threadId, {
        ...(existing ?? { projectId: context.projectId ?? null }),
        loading: true,
        error: null,
      });

      try {
        const result = await requestActivateThreadSnapshot(ctx, {
          hostId,
          projectId: context.projectId ?? null,
          threadId,
          limit: context.limit ?? INITIAL_TURN_PAGE_LIMIT,
        });
        const view = {
          hostId,
          projectId: result.projectId ?? context.projectId ?? null,
          threadId,
          currentThread: result.thread,
          history: result.history,
          events: [...result.recentEvents],
          olderTurnsCursor: result.turnsPage.nextCursor,
          newerTurnsCursor: result.turnsPage.backwardsCursor,
          lastEventId: result.lastEventId,
          loading: false,
          error: null,
        };
        upsertThreadView(ctx, view);
        ctx.rememberThreadSubscription(hostId, threadId, result.lastEventId);
        return ctx.state.threadViews[key];
      } catch (error: any) {
        const message = messageFromError(error, ctx.t("app.openThreadFailed"), ctx.errorLabels);
        patchThreadView(ctx, hostId, threadId, {
          projectId: context.projectId ?? existing?.projectId ?? null,
          loading: false,
          error: message,
        });
        throw error;
      }
    },

    async restoreLastOpenThread() {
      const last = ctx.state.gatewayConfig.lastOpenThread;
      if (!last || !ctx.state.hosts.some((host) => host.id === last.hostId)) {
        return;
      }
      ctx.state.selectedHostId = last.hostId;
      ctx.state.selectedProjectId = last.projectId;
      await ctx.openThread(last.threadId, {
        hostId: last.hostId,
        projectId: last.projectId,
        replaceRoute: true,
      });
      ctx.syncSelectedRoute({ replace: true });
    },

    async startThread(
      options: ComposerTurnOptions = {},
      context?: { hostId?: number; projectId?: number | null },
    ) {
      ctx.cacheSelectedThreadView();
      const viewEpoch = ctx.beginViewTransition();
      if (context?.hostId) {
        activateThreadView(ctx, context.hostId, context.projectId ?? null);
      } else if (context && "projectId" in context) {
        ctx.state.selectedProjectId = context.projectId ?? null;
        ctx.clearCurrentThreadView();
      }
      if (!ctx.state.selectedHostId) {
        return;
      }
      const result = await requestStartThread(ctx, options);
      if (!ctx.isCurrentViewTransition(viewEpoch)) {
        return;
      }
      const threadId = applyStartedThreadResult(ctx, result);
      ctx.cacheSelectedThreadView();
      ctx.connectEvents();
      await ctx.listThreads();
      ctx.cacheSelectedThreadView();
      await ctx.rememberOpenThread(threadId);
      ctx.syncSelectedRoute();
    },
  };
}

function syncRestoredThreadStatus(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const status = runtimeStatusFromThreadState(
    ctx.state.currentThread,
    ctx.state.history,
    ctx.state.events,
  );
  if (status) {
    ctx.setThreadStatus(hostId, threadId, status);
  }
}

async function syncOpenThreadFromServer(
  ctx: GatewayStoreContext,
  input: {
    hostId: number;
    projectId: number | null;
    threadId: string;
    viewEpoch: number;
    replaceRoute?: boolean;
    showLoading: boolean;
  },
) {
  if (input.showLoading) {
    ctx.state.loading = true;
  }
  ctx.clearError();
  try {
    const result = await requestActivateThreadSnapshot(ctx, {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
    });
    if (!ctx.isCurrentViewTransition(input.viewEpoch)) {
      return;
    }
    applyThreadSnapshotResult(ctx, input.threadId, result);
    ctx.cacheSelectedThreadView();
    await ctx.rememberOpenThread(input.threadId);
    ctx.syncSelectedRoute({ replace: input.replaceRoute });
    void refreshGoalAfterOpen(ctx, input.hostId, input.threadId);
    ctx.requestScrollToLatest();
  } catch (error: any) {
    ctx.setError(messageFromError(error, ctx.t("app.openThreadFailed"), ctx.errorLabels), {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
    });
  } finally {
    if (input.showLoading) {
      ctx.state.loading = false;
    }
  }
}

async function refreshGoalAfterOpen(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  try {
    if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
      await ctx.refreshSelectedThreadGoal();
    }
  } catch (error: any) {
    ctx.setError(messageFromError(error, ctx.t("app.refreshThreadGoalFailed"), ctx.errorLabels), {
      hostId,
      threadId,
      projectId: ctx.state.selectedProjectId,
    });
  }
}
