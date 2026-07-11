import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
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
import { clearThreadCompletionAttention } from "../thread-runtime/completion-attention";

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

    rememberOpenThread(threadId: string) {
      rememberOpenThread(ctx, threadId);
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
      clearThreadCompletionAttention(ctx, targetHostId, threadId);
      if (
        ctx.state.selectedHostId === targetHostId &&
        ctx.state.selectedThreadId === threadId &&
        ctx.state.currentThread &&
        ctx.state.history
      ) {
        void ctx.ensureSelectedHostModels();
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        useGatewayRealtimeStore().connectThreadEvents();
        void refreshGoalAfterOpen(ctx, targetHostId, threadId);
        ctx.requestScrollToLatest();
        return;
      }
      const viewEpoch = ctx.beginViewTransition();
      if (ctx.state.modelsHostId !== targetHostId) {
        ctx.state.models = [];
        ctx.state.modelsHostId = null;
      }
      activatePendingThreadView(ctx, targetHostId, targetProjectId, threadId);
      void ctx.ensureSelectedHostModels();
      if (ctx.restoreThreadView(targetHostId, threadId)) {
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        useGatewayRealtimeStore().connectThreadEvents();
        void refreshGoalAfterOpen(ctx, targetHostId, threadId);
        ctx.requestScrollToLatest();
        void syncOpenThreadFromServer(ctx, {
          hostId: targetHostId,
          projectId: targetProjectId,
          threadId,
          viewEpoch,
          replaceRoute: context?.replaceRoute,
          showLoading: false,
          scrollToLatest: false,
        });
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
        useGatewayRealtimeStore().connectThreadEvents(hostId, threadId);
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
        useGatewayRealtimeStore().rememberThreadSubscription(hostId, threadId, result.lastEventId);
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

    async refreshSelectedThreadSnapshot(
      options: { showLoading?: boolean; scrollToLatest?: boolean } = {},
    ) {
      const hostId = ctx.state.selectedHostId;
      const projectId = ctx.state.selectedProjectId;
      const threadId = ctx.state.selectedThreadId;
      if (!hostId || !threadId) {
        return;
      }
      const viewEpoch = ctx.state.viewEpoch;
      if (options.showLoading) {
        ctx.state.loading = true;
      }
      try {
        const result = await requestActivateThreadSnapshot(ctx, {
          hostId,
          projectId,
          threadId,
        });
        if (
          ctx.state.viewEpoch !== viewEpoch ||
          ctx.state.selectedHostId !== hostId ||
          ctx.state.selectedThreadId !== threadId ||
          isOlderSnapshot(ctx, result.lastEventId)
        ) {
          return;
        }
        applyThreadSnapshotResult(ctx, threadId, result);
        ctx.cacheSelectedThreadView();
        useGatewayRealtimeStore().rememberThreadSubscription(hostId, threadId, result.lastEventId);
        void refreshGoalAfterOpen(ctx, hostId, threadId);
        if (options.scrollToLatest) {
          ctx.requestScrollToLatest();
        }
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.openThreadFailed"), ctx.errorLabels), {
          hostId,
          projectId,
          threadId,
        });
      } finally {
        if (options.showLoading) {
          ctx.state.loading = false;
        }
      }
    },

    async restoreLastOpenThread() {
      const last = useGatewayNavigationStore().lastOpenThread;
      if (
        !last.hostId ||
        !last.threadId ||
        !ctx.state.hosts.some((host) => host.id === last.hostId)
      ) {
        return false;
      }
      ctx.state.selectedHostId = last.hostId;
      ctx.state.selectedProjectId = last.projectId;
      await ctx.openThread(last.threadId, {
        hostId: last.hostId,
        projectId: last.projectId,
        replaceRoute: true,
      });
      ctx.syncSelectedRoute({ replace: true });
      return true;
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
      useGatewayRealtimeStore().connectThreadEvents();
      await ctx.listThreads();
      ctx.cacheSelectedThreadView();
      ctx.rememberOpenThread(threadId);
      ctx.syncSelectedRoute();
    },
  };
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
    scrollToLatest?: boolean;
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
    if (!ctx.isCurrentViewTransition(input.viewEpoch) || isOlderSnapshot(ctx, result.lastEventId)) {
      return;
    }
    applyThreadSnapshotResult(ctx, input.threadId, result);
    ctx.cacheSelectedThreadView();
    ctx.rememberOpenThread(input.threadId);
    ctx.syncSelectedRoute({ replace: input.replaceRoute });
    void refreshGoalAfterOpen(ctx, input.hostId, input.threadId);
    if (input.scrollToLatest ?? true) {
      ctx.requestScrollToLatest();
    }
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

function isOlderSnapshot(ctx: GatewayStoreContext, snapshotLastEventId: number) {
  return snapshotLastEventId < ctx.state.lastEventId;
}

async function refreshGoalAfterOpen(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  try {
    const key = pinnedKey(hostId, threadId);
    if (
      !(key in ctx.state.threadGoalObservedAtByKey) &&
      ctx.state.selectedHostId === hostId &&
      ctx.state.selectedThreadId === threadId
    ) {
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
