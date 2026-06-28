import type { ComposerTurnOptions, ThreadOpenResult } from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import type { GatewayStoreContext } from "../types";
import {
  messageFromError,
  pinnedKey,
  runtimeStatusFromThreadState,
  threadIdFromParams,
} from "../thread-utils";
import { writeGatewayRouteSelection } from "../route-state";

export function createThreadOpenActions(ctx: GatewayStoreContext) {
  return {
    beginViewTransition() {
      ctx.state.viewEpoch += 1;
      return ctx.state.viewEpoch;
    },

    isCurrentViewTransition(epoch: number) {
      return ctx.state.viewEpoch === epoch;
    },

    cacheSelectedThreadSnapshot() {
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
    },

    restoreThreadSnapshot(hostId: number, threadId: string) {
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
    },

    clearCurrentThreadView() {
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.state.olderTurnsCursor = null;
      ctx.state.newerTurnsCursor = null;
      ctx.state.lastEventId = 0;
    },

    rememberOpenThread(threadId: string) {
      if (!ctx.state.selectedHostId) {
        return;
      }
      ctx.state.gatewayConfig.lastOpenThread = {
        hostId: ctx.state.selectedHostId,
        projectId: ctx.state.selectedProjectId,
        threadId,
      };
      ctx.persistConfig();
    },

    requestScrollToLatest() {
      ctx.state.scrollToLatestToken += 1;
    },

    syncSelectedRoute(options: { replace?: boolean } = {}) {
      writeGatewayRouteSelection(
        {
          hostId: ctx.state.selectedHostId,
          projectId: ctx.state.selectedProjectId,
          threadId: ctx.state.selectedThreadId,
        },
        options,
      );
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
      ctx.state.selectedHostId = targetHostId;
      ctx.state.selectedProjectId = targetProjectId;
      ctx.clearCurrentThreadView();
      if (ctx.restoreThreadSnapshot(targetHostId, threadId)) {
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.connectEvents();
        ctx.requestScrollToLatest();
        return;
      }

      ctx.state.loading = true;
      ctx.state.error = null;
      try {
        const result = await $fetch<ThreadOpenResult>("/api/threads/open", {
          method: "POST",
          body: {
            hostId: targetHostId,
            projectId: targetProjectId,
            threadId,
            limit: 20,
          },
        });
        if (!ctx.isCurrentViewTransition(viewEpoch)) {
          return;
        }
        ctx.state.currentThread = result.thread;
        ctx.state.history = result.history;
        if (result.projectId) {
          ctx.state.selectedProjectId = result.projectId;
        }
        ctx.state.selectedThreadId = threadId;
        if (result.project) {
          ctx.mergeProjects([result.project]);
        }
        ctx.state.olderTurnsCursor = result.turnsPage.nextCursor;
        ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor;
        ctx.setThreadSettings(ctx.state.selectedHostId, threadId, result.threadSettings);
        if (result.tokenUsage) {
          ctx.setThreadTokenUsage(ctx.state.selectedHostId, threadId, result.tokenUsage);
        }
        ctx.state.events = result.recentEvents;
        ctx.state.lastEventId = result.recentEvents.at(-1)?.id ?? 0;
        if (!result.tokenUsage) {
          syncTokenUsageFromRecentEvents(ctx, result.recentEvents);
        }
        syncRuntimeStatusFromThread(
          ctx,
          ctx.state.selectedHostId,
          threadId,
          result.thread,
          result.history,
        );
        for (const event of result.recentEvents) {
          ctx.applyLiveEvent(event);
        }
        ctx.cacheSelectedThreadSnapshot();
        ctx.connectEvents();
        ctx.upsertPinnedMetadataFromThread(result.thread as any);
        ctx.rememberOpenThread(threadId);
        ctx.syncSelectedRoute({ replace: context?.replaceRoute });
        ctx.requestScrollToLatest();
      } catch (error: any) {
        ctx.setError(messageFromError(error, "Failed to open thread"));
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
        ctx.state.selectedHostId = context.hostId;
        ctx.state.selectedProjectId = context.projectId ?? null;
        ctx.clearCurrentThreadView();
      } else if (context && "projectId" in context) {
        ctx.state.selectedProjectId = context.projectId ?? null;
        ctx.clearCurrentThreadView();
      }
      if (!ctx.state.selectedHostId) {
        return;
      }
      const result = await $fetch<ThreadOpenResult>("/api/threads/start", {
        method: "POST",
        body: {
          hostId: ctx.state.selectedHostId,
          projectId: ctx.state.selectedProjectId,
          cwd: ctx.selectedProject?.remotePath,
          model: options.model || undefined,
          effort: options.effort || undefined,
          approvalPolicy: options.approvalPolicy || undefined,
        },
      });
      if (!ctx.isCurrentViewTransition(viewEpoch)) {
        return;
      }
      const thread = result.thread as any;
      ctx.state.currentThread = result.thread;
      ctx.state.history = result.history;
      ctx.state.events = result.recentEvents;
      ctx.state.olderTurnsCursor = result.turnsPage.nextCursor;
      ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor;
      ctx.state.selectedThreadId = String(thread.id);
      ctx.state.lastEventId = result.recentEvents.at(-1)?.id ?? 0;
      ctx.setThreadSettings(ctx.state.selectedHostId, String(thread.id), result.threadSettings);
      if (result.tokenUsage) {
        ctx.setThreadTokenUsage(ctx.state.selectedHostId, String(thread.id), result.tokenUsage);
      } else {
        syncTokenUsageFromRecentEvents(ctx, result.recentEvents);
      }
      syncRuntimeStatusFromThread(
        ctx,
        ctx.state.selectedHostId,
        String(thread.id),
        result.thread,
        result.history,
      );
      ctx.cacheSelectedThreadSnapshot();
      ctx.connectEvents();
      await ctx.listThreads();
      ctx.cacheSelectedThreadSnapshot();
      ctx.rememberOpenThread(String(thread.id));
      ctx.syncSelectedRoute();
    },
  };
}

function syncRuntimeStatusFromThread(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  thread: unknown,
  history: unknown,
) {
  const status = runtimeStatusFromThreadState(thread, history);
  if (status) {
    ctx.setThreadStatus(hostId, threadId, status);
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
