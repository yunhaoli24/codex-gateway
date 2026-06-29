import type { ComposerTurnOptions } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError } from "../thread-utils/identity";
import { applyOpenedThreadResult, applyStartedThreadResult } from "../thread-open/hydration";
import { requestOpenThread, requestStartThread } from "../thread-open/transport";
import {
  activateThreadView,
  beginViewTransition,
  cacheSelectedThreadSnapshot,
  clearCurrentThreadView,
  isCurrentViewTransition,
  rememberOpenThread,
  requestScrollToLatest,
  restoreThreadSnapshot,
  syncSelectedRoute,
} from "../thread-open/view-state";

export function createThreadOpenActions(ctx: GatewayStoreContext) {
  return {
    beginViewTransition() {
      return beginViewTransition(ctx);
    },

    isCurrentViewTransition(epoch: number) {
      return isCurrentViewTransition(ctx, epoch);
    },

    cacheSelectedThreadSnapshot() {
      cacheSelectedThreadSnapshot(ctx);
    },

    restoreThreadSnapshot(hostId: number, threadId: string) {
      return restoreThreadSnapshot(ctx, hostId, threadId);
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
      ctx.cacheSelectedThreadSnapshot();
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
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        ctx.requestScrollToLatest();
        return;
      }
      const viewEpoch = ctx.beginViewTransition();
      activateThreadView(ctx, targetHostId, targetProjectId);
      if (ctx.restoreThreadSnapshot(targetHostId, threadId)) {
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        ctx.requestScrollToLatest();
        return;
      }

      ctx.state.loading = true;
      ctx.clearError();
      try {
        const result = await requestOpenThread({
          hostId: targetHostId,
          projectId: targetProjectId,
          threadId,
        });
        if (!ctx.isCurrentViewTransition(viewEpoch)) {
          return;
        }
        applyOpenedThreadResult(ctx, threadId, result);
        ctx.cacheSelectedThreadSnapshot();
        ctx.connectEvents();
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.requestScrollToLatest();
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.openThreadFailed"), ctx.errorLabels), {
          hostId: targetHostId,
          projectId: targetProjectId,
          threadId,
        });
      } finally {
        ctx.state.loading = false;
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
    },

    async startThread(
      options: ComposerTurnOptions = {},
      context?: { hostId?: number; projectId?: number | null },
    ) {
      ctx.cacheSelectedThreadSnapshot();
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
      ctx.cacheSelectedThreadSnapshot();
      ctx.connectEvents();
      await ctx.listThreads();
      ctx.cacheSelectedThreadSnapshot();
      ctx.rememberOpenThread(threadId);
      ctx.syncSelectedRoute();
    },
  };
}
