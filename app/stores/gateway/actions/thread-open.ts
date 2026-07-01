import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { applyOpenedThreadResult, applyStartedThreadResult } from "../thread-open/hydration";
import { requestOpenThread, requestStartThread } from "../thread-open/transport";
import {
  activateThreadView,
  activatePendingThreadView,
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
        await ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        ctx.requestScrollToLatest();
        return;
      }
      const viewEpoch = ctx.beginViewTransition();
      activatePendingThreadView(ctx, targetHostId, targetProjectId, threadId);
      if (ctx.restoreThreadSnapshot(targetHostId, threadId)) {
        await ctx.rememberOpenThread(threadId);
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
        await ctx.rememberOpenThread(threadId);
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

    async openThreadPreview(
      hostId: number,
      threadId: string,
      context: { projectId?: number | null; limit?: number } = {},
    ) {
      const key = pinnedKey(hostId, threadId);
      const existing = ctx.state.threadPreviews[key];
      if (existing?.history && !existing.error) {
        ctx.connectEvents(hostId, threadId);
        return existing;
      }

      ctx.state.threadPreviews = {
        ...ctx.state.threadPreviews,
        [key]: {
          ...(existing ?? {
            hostId,
            projectId: context.projectId ?? null,
            threadId,
            currentThread: null,
            history: null,
            events: [],
            olderTurnsCursor: null,
            newerTurnsCursor: null,
            lastEventId: 0,
          }),
          loading: true,
          error: null,
        },
      };

      try {
        const result = await requestOpenThread({
          hostId,
          projectId: context.projectId ?? null,
          threadId,
          limit: context.limit ?? INITIAL_TURN_PAGE_LIMIT,
        });
        const preview = {
          hostId,
          projectId: result.projectId ?? context.projectId ?? null,
          threadId,
          currentThread: result.thread,
          history: result.history,
          events: [],
          olderTurnsCursor: result.turnsPage.nextCursor,
          newerTurnsCursor: result.turnsPage.backwardsCursor,
          lastEventId: 0,
          loading: false,
          error: null,
        };
        ctx.state.threadSnapshots = {
          ...ctx.state.threadSnapshots,
          [key]: preview,
        };
        ctx.state.threadPreviews = {
          ...ctx.state.threadPreviews,
          [key]: preview,
        };
        for (const event of result.recentEvents) {
          ctx.applyLiveEvent(event);
        }
        const hydratedPreview = ctx.state.threadPreviews[key] ?? preview;
        const hydratedSnapshot = ctx.state.threadSnapshots[key] ?? preview;
        const lastEventId = result.recentEvents.at(-1)?.id ?? 0;
        ctx.state.threadSnapshots = {
          ...ctx.state.threadSnapshots,
          [key]: {
            ...hydratedSnapshot,
            events: [...result.recentEvents],
            olderTurnsCursor: result.turnsPage.nextCursor,
            newerTurnsCursor: result.turnsPage.backwardsCursor,
            lastEventId,
          },
        };
        ctx.state.threadPreviews = {
          ...ctx.state.threadPreviews,
          [key]: {
            ...hydratedPreview,
            events: [...result.recentEvents],
            olderTurnsCursor: result.turnsPage.nextCursor,
            newerTurnsCursor: result.turnsPage.backwardsCursor,
            lastEventId,
            loading: false,
            error: null,
          },
        };
        ctx.connectEvents(hostId, threadId);
        return ctx.state.threadPreviews[key];
      } catch (error: any) {
        const message = messageFromError(error, ctx.t("app.openThreadFailed"), ctx.errorLabels);
        ctx.state.threadPreviews = {
          ...ctx.state.threadPreviews,
          [key]: {
            ...(ctx.state.threadPreviews[key] ?? {
              hostId,
              projectId: context.projectId ?? null,
              threadId,
              currentThread: null,
              history: null,
              events: [],
              olderTurnsCursor: null,
              newerTurnsCursor: null,
              lastEventId: 0,
            }),
            loading: false,
            error: message,
          },
        };
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
      await ctx.rememberOpenThread(threadId);
      ctx.syncSelectedRoute();
    },
  };
}
