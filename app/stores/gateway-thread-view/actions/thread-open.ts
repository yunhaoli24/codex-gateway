import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import {
  applyStartedThreadResult,
  applyThreadSnapshotResult,
} from "@/stores/gateway/thread-open/hydration";
import {
  requestActivateThreadSnapshot,
  requestStartThread,
} from "@/stores/gateway/thread-open/transport";
import { messageFromError, pinnedKey } from "@/stores/gateway/thread-utils/identity";
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
} from "@/stores/gateway/thread-open/view-state";
import { patchThreadView, upsertThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import { clearThreadCompletionAttention } from "@/stores/gateway/thread-runtime/completion-attention";

export function createThreadOpenActions() {
  return {
    beginViewTransition,
    isCurrentViewTransition,
    cacheSelectedThreadView,
    restoreThreadView,
    clearCurrentThreadView,
    rememberOpenThread,
    requestScrollToLatest,
    syncSelectedRoute,

    async openThread(
      threadId: string,
      context?: { hostId?: number; projectId?: number | null; replaceRoute?: boolean },
    ) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      cacheSelectedThreadView();
      const targetHostId = context?.hostId ?? navigation.selectedHostId;
      const targetProjectId =
        context && "projectId" in context
          ? (context.projectId ?? null)
          : navigation.selectedProjectId;
      if (!targetHostId) return;
      clearThreadCompletionAttention(targetHostId, threadId);
      if (
        navigation.selectedHostId === targetHostId &&
        navigation.selectedThreadId === threadId &&
        views.currentThread &&
        views.history
      ) {
        void gateway.ensureSelectedHostModels();
        finishThreadSelection(threadId, context?.replaceRoute);
        void refreshGoalAfterOpen(targetHostId, threadId);
        requestScrollToLatest();
        return;
      }
      const viewEpoch = beginViewTransition();
      if (gateway.modelsHostId !== targetHostId) {
        gateway.models = [];
        gateway.modelsHostId = null;
      }
      activatePendingThreadView(targetHostId, targetProjectId, threadId);
      void gateway.ensureSelectedHostModels();
      if (restoreThreadView(targetHostId, threadId)) {
        const cachedTurnLimit = Math.max(
          INITIAL_TURN_PAGE_LIMIT,
          threadTurnsFromHistory(views.history).length,
        );
        finishThreadSelection(threadId, context?.replaceRoute);
        void refreshGoalAfterOpen(targetHostId, threadId);
        requestScrollToLatest();
        void syncOpenThreadFromServer({
          hostId: targetHostId,
          projectId: targetProjectId,
          threadId,
          viewEpoch,
          replaceRoute: context?.replaceRoute,
          showLoading: false,
          scrollToLatest: false,
          limit: cachedTurnLimit,
        });
        return;
      }
      await syncOpenThreadFromServer({
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
      const gateway = useGatewayStore();
      const views = useGatewayThreadViewStore();
      const key = pinnedKey(hostId, threadId);
      const existing = views.threadViews[key];
      if (existing?.history && !existing.error) {
        useGatewayRealtimeStore().connectThreadEvents(hostId, threadId);
        return existing;
      }
      patchThreadView(hostId, threadId, {
        ...(existing ?? { projectId: context.projectId ?? null }),
        loading: true,
        error: null,
      });
      try {
        const result = await requestActivateThreadSnapshot({
          hostId,
          projectId: context.projectId ?? null,
          threadId,
          limit: context.limit ?? INITIAL_TURN_PAGE_LIMIT,
        });
        upsertThreadView({
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
        });
        useGatewayRealtimeStore().rememberThreadSubscription(hostId, threadId, result.lastEventId);
        return views.threadViews[key];
      } catch (error: any) {
        patchThreadView(hostId, threadId, {
          projectId: context.projectId ?? existing?.projectId ?? null,
          loading: false,
          error: messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
        });
        throw error;
      }
    },

    async refreshSelectedThreadSnapshot(
      options: { showLoading?: boolean; scrollToLatest?: boolean } = {},
    ) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const hostId = navigation.selectedHostId;
      const projectId = navigation.selectedProjectId;
      const threadId = navigation.selectedThreadId;
      if (!hostId || !threadId) return;
      const viewEpoch = views.viewEpoch;
      if (options.showLoading) views.loading = true;
      try {
        const result = await requestActivateThreadSnapshot({ hostId, projectId, threadId });
        if (
          views.viewEpoch !== viewEpoch ||
          navigation.selectedHostId !== hostId ||
          navigation.selectedThreadId !== threadId ||
          result.lastEventId < views.lastEventId
        )
          return;
        applyThreadSnapshotResult(threadId, result);
        cacheSelectedThreadView();
        useGatewayRealtimeStore().rememberThreadSubscription(hostId, threadId, result.lastEventId);
        void refreshGoalAfterOpen(hostId, threadId);
        if (options.scrollToLatest) requestScrollToLatest();
      } catch (error: any) {
        gateway.setError(
          messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
          { hostId, projectId, threadId },
        );
      } finally {
        if (options.showLoading) views.loading = false;
      }
    },

    async restoreLastOpenThread() {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const last = navigation.lastOpenThread;
      if (
        !last.hostId ||
        !last.threadId ||
        !gateway.hosts.some((host) => host.id === last.hostId)
      ) {
        return false;
      }
      navigation.selectedHostId = last.hostId;
      navigation.selectedProjectId = last.projectId;
      await useGatewayThreadViewStore().openThread(last.threadId, {
        hostId: last.hostId,
        projectId: last.projectId,
        replaceRoute: true,
      });
      syncSelectedRoute({ replace: true });
      return true;
    },

    async startThread(
      options: ComposerTurnOptions = {},
      context?: { hostId?: number; projectId?: number | null },
    ) {
      const navigation = useGatewayNavigationStore();
      cacheSelectedThreadView();
      const viewEpoch = beginViewTransition();
      if (context?.hostId) activateThreadView(context.hostId, context.projectId ?? null);
      else if (context && "projectId" in context) {
        navigation.selectedProjectId = context.projectId ?? null;
        clearCurrentThreadView();
      }
      if (!navigation.selectedHostId) return;
      const result = await requestStartThread(options);
      if (!isCurrentViewTransition(viewEpoch)) return;
      const threadId = applyStartedThreadResult(result);
      cacheSelectedThreadView();
      rememberOpenThread(threadId);
      syncSelectedRoute();
      useGatewayRealtimeStore().connectThreadEvents();

      // Creating the thread is the authoritative state transition. Commit its selection and URL
      // before refreshing the sidebar catalog: that secondary RPC may be slow while a host has
      // just upgraded/restarted, but it must not leave a successfully created thread unreachable.
      await navigation.listThreads();
      cacheSelectedThreadView();
    },
  };
}

async function syncOpenThreadFromServer(input: {
  hostId: number;
  projectId: number | null;
  threadId: string;
  viewEpoch: number;
  replaceRoute?: boolean;
  showLoading: boolean;
  scrollToLatest?: boolean;
  limit?: number;
}) {
  const gateway = useGatewayStore();
  const views = useGatewayThreadViewStore();
  if (input.showLoading) views.loading = true;
  gateway.clearError();
  try {
    const result = await requestActivateThreadSnapshot(input);
    if (!isCurrentViewTransition(input.viewEpoch) || result.lastEventId < views.lastEventId) return;
    applyThreadSnapshotResult(input.threadId, result);
    cacheSelectedThreadView();
    finishThreadSelection(input.threadId, input.replaceRoute);
    void refreshGoalAfterOpen(input.hostId, input.threadId);
    if (input.scrollToLatest ?? true) requestScrollToLatest();
  } catch (error: any) {
    gateway.setError(
      messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
      { hostId: input.hostId, projectId: input.projectId, threadId: input.threadId },
    );
  } finally {
    if (input.showLoading) views.loading = false;
  }
}

function finishThreadSelection(threadId: string, replaceRoute?: boolean) {
  rememberOpenThread(threadId);
  syncSelectedRoute({ replace: replaceRoute });
  useGatewayRealtimeStore().connectThreadEvents();
}

async function refreshGoalAfterOpen(hostId: number, threadId: string) {
  const gateway = useGatewayStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  try {
    const key = pinnedKey(hostId, threadId);
    if (
      !(key in composer.threadGoalObservedAtByKey) &&
      navigation.selectedHostId === hostId &&
      navigation.selectedThreadId === threadId
    ) {
      await composer.refreshSelectedThreadGoal();
    }
  } catch (error: any) {
    gateway.setError(
      messageFromError(error, gateway.t("app.refreshThreadGoalFailed"), gateway.errorLabels),
      { hostId, threadId, projectId: navigation.selectedProjectId },
    );
  }
}
