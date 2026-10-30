import type { ComposerTurnOptions } from "~~/shared/types";
import { INITIAL_TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import {
  applyStartedThreadResult,
  applyThreadSnapshotResult,
} from "@/stores/gateway/thread-open/hydration";
import { requestStartThread } from "@/stores/gateway/thread-open/transport";
import { coordinateThreadSnapshot } from "@/stores/gateway/thread-open/snapshot-coordinator";
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
import { captureSessionEpoch } from "@/utils/session-epoch";

const previewLoadTokens = new Map<string, symbol>();
interface EventGapRecovery {
  promise: Promise<void>;
  sessionIsCurrent: () => boolean;
}

const eventGapRecoveries = new Map<string, EventGapRecovery>();

export function invalidateThreadPreviewLoad(hostId: number, threadId: string) {
  // Deleting the ownership token invalidates an in-flight response without retaining one
  // generation counter for every subagent ever opened during this page lifetime.
  previewLoadTokens.delete(pinnedKey(hostId, threadId));
}

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
      context?: { hostId?: number; cwd?: string | null; replaceRoute?: boolean },
    ) {
      const gateway = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      cacheSelectedThreadView();
      const targetHostId = context?.hostId ?? navigation.selectedHostId;
      const targetCwd = context?.cwd ?? null;
      if (targetHostId === null || targetHostId === undefined) return;
      clearThreadCompletionAttention(targetHostId, threadId);
      if (
        navigation.selectedHostId === targetHostId &&
        navigation.selectedThreadId === threadId &&
        views.currentThread !== null &&
        views.history !== null
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
      activatePendingThreadView(targetHostId, targetCwd, threadId);
      void gateway.ensureSelectedHostModels();
      if (restoreThreadView(targetHostId, threadId)) {
        finishThreadSelection(threadId, context?.replaceRoute);
        void refreshGoalAfterOpen(targetHostId, threadId);
        requestScrollToLatest();
        void syncOpenThreadFromServer({
          hostId: targetHostId,
          threadId,
          viewEpoch,
          replaceRoute: context?.replaceRoute,
          showLoading: false,
          scrollToLatest: false,
        });
        return;
      }
      await syncOpenThreadFromServer({
        hostId: targetHostId,
        threadId,
        viewEpoch,
        replaceRoute: context?.replaceRoute,
        showLoading: true,
      });
    },

    async openThreadPreview(hostId: number, threadId: string, context: { limit?: number } = {}) {
      const gateway = useGatewayBootstrapStore();
      const views = useGatewayThreadViewStore();
      const key = pinnedKey(hostId, threadId);
      const existing = views.threadViews[key];
      if (
        existing?.history !== null &&
        existing?.history !== undefined &&
        (existing.error === null || existing.error === undefined || existing.error === "")
      ) {
        if (existing.readOnly !== true) {
          useGatewayRealtimeStore().connectThreadEvents(
            hostId,
            threadId,
            existing.lastEventId,
            existing.eventEpoch,
          );
        }
        return existing;
      }
      const loadToken = beginPreviewLoad(key);
      patchThreadView(hostId, threadId, {
        ...(existing ?? { cwd: null }),
        loading: true,
        error: null,
      });
      return coordinateThreadSnapshot({
        input: {
          hostId,
          threadId,
          limit: context.limit ?? INITIAL_TIMELINE_PAGE_LIMIT,
        },
        accept: () => previewLoadTokens.get(key) === loadToken,
        discard: () => {
          // thread.activate subscribes upstream before returning its snapshot. If the owning
          // panel disappeared while awaiting it, explicitly release that late subscription.
          // A newer generation may represent a reopened panel and owns the same app-server
          // subscription, so the obsolete response must not unsubscribe that replacement.
          const panelStillOpen = views.subAgentPanels.some(
            (panel) => pinnedKey(panel.hostId, panel.threadId) === key,
          );
          if (!panelStillOpen) useGatewayRealtimeStore().cancelThreadEvents(hostId, threadId);
        },
        commit: (result) => {
          upsertThreadView({
            hostId,
            cwd: result.thread.cwd,
            threadId,
            currentThread: result.thread,
            history: result.history,
            events: [...result.recentEvents],
            oldestTimelineCursor: result.oldestTimelineCursor,
            lastEventId: result.lastEventId,
            appliedEventId: existing?.appliedEventId ?? result.lastEventId,
            eventEpoch: result.eventEpoch,
            loading: false,
            error: null,
            readOnly: result.readOnly === true,
          });
          return views.threadViews[key];
        },
        fail: (error) => {
          if (previewLoadTokens.get(key) !== loadToken) return;
          patchThreadView(hostId, threadId, {
            cwd: existing?.cwd ?? null,
            loading: false,
            error: messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
          });
        },
        rethrow: true,
      }).finally(() => {
        // Compare identity before deleting: a reopened panel may already own a newer request.
        if (previewLoadTokens.get(key) === loadToken) previewLoadTokens.delete(key);
      });
    },

    async refreshSelectedThreadSnapshot(
      options: { showLoading?: boolean; scrollToLatest?: boolean } = {},
    ) {
      const gateway = useGatewayBootstrapStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const hostId = navigation.selectedHostId;
      const threadId = navigation.selectedThreadId;
      if (hostId === null || threadId === null || threadId === "") return;
      const viewEpoch = views.viewEpoch;
      await coordinateThreadSnapshot({
        input: { hostId, threadId },
        setLoading:
          options.showLoading === true
            ? (loading) => {
                if (isCurrentViewTransition(viewEpoch)) views.loading = loading;
              }
            : undefined,
        accept: (result) =>
          views.viewEpoch !== viewEpoch ||
          navigation.selectedHostId !== hostId ||
          navigation.selectedThreadId !== threadId ||
          (result.eventEpoch === views.eventEpoch && result.lastEventId < views.lastEventId)
            ? false
            : true,
        commit: (result) => {
          applyThreadSnapshotResult(threadId, result);
          cacheSelectedThreadView();
          void refreshGoalAfterOpen(hostId, threadId);
          if (options.scrollToLatest === true) requestScrollToLatest();
        },
        fail: (error) =>
          gateway.setError(
            messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
            { hostId, threadId },
          ),
      });
    },

    async retryThreadWriter() {
      const gateway = useGatewayBootstrapStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const hostId = navigation.selectedHostId;
      const threadId = navigation.selectedThreadId;
      if (hostId === null || threadId === null || !views.readOnly) return;
      const viewEpoch = views.viewEpoch;
      await coordinateThreadSnapshot({
        input: { hostId, threadId, retryWriter: true },
        accept: () =>
          views.viewEpoch !== viewEpoch ||
          navigation.selectedHostId !== hostId ||
          navigation.selectedThreadId !== threadId
            ? false
            : true,
        commit: (result) => {
          applyThreadSnapshotResult(threadId, result, true);
          cacheSelectedThreadView();
          if (result.readOnly !== true) {
            useGatewayRealtimeStore().connectThreadEvents(
              hostId,
              threadId,
              result.lastEventId,
              result.eventEpoch,
            );
            void refreshGoalAfterOpen(hostId, threadId);
          }
        },
        fail: (error) =>
          gateway.setError(
            messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
            { hostId, threadId },
          ),
      });
    },

    recoverThreadEventGap(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId);
      const pending = eventGapRecoveries.get(key);
      if (pending !== undefined && pending.sessionIsCurrent()) return pending.promise;
      const sessionIsCurrent = captureSessionEpoch();
      const recovery = recoverThreadSnapshot(hostId, threadId).finally(() => {
        if (eventGapRecoveries.get(key)?.promise === recovery) eventGapRecoveries.delete(key);
      });
      eventGapRecoveries.set(key, { promise: recovery, sessionIsCurrent });
      return recovery;
    },

    async restoreLastOpenThread() {
      const gateway = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      const last = navigation.lastOpenThread;
      if (
        last.hostId === null ||
        last.threadId === null ||
        last.threadId === "" ||
        !gateway.hosts.some((host) => host.id === last.hostId)
      ) {
        return false;
      }
      navigation.selectedHostId = last.hostId;
      navigation.selectedCwd = null;
      await useGatewayThreadViewStore().openThread(last.threadId, {
        hostId: last.hostId,
        replaceRoute: true,
      });
      syncSelectedRoute({ replace: true });
      return true;
    },

    async startThread(
      options: ComposerTurnOptions = {},
      context?: { hostId?: number; cwd?: string | null },
    ) {
      const navigation = useGatewayNavigationStore();
      cacheSelectedThreadView();
      const viewEpoch = beginViewTransition();
      if (context?.hostId !== undefined) activateThreadView(context.hostId, context.cwd ?? null);
      else if (context && "cwd" in context) {
        navigation.selectedCwd = context.cwd ?? null;
        clearCurrentThreadView();
      }
      if (navigation.selectedHostId === null) return;
      const sessionIsCurrent = captureSessionEpoch();
      const result = await requestStartThread(options);
      if (!sessionIsCurrent() || !isCurrentViewTransition(viewEpoch)) return;
      const threadId = applyStartedThreadResult(result);
      cacheSelectedThreadView();
      rememberOpenThread(threadId);
      syncSelectedRoute();
      useGatewayRealtimeStore().connectThreadEvents(
        navigation.selectedHostId,
        threadId,
        useGatewayThreadViewStore().lastEventId,
        useGatewayThreadViewStore().eventEpoch,
      );

      // Creating the thread is the authoritative state transition. Commit its selection and URL
      // before refreshing the sidebar catalog: that secondary RPC may be slow while a host has
      // just upgraded/restarted, but it must not leave a successfully created thread unreachable.
      await navigation.listThreads();
      cacheSelectedThreadView();
    },
  };
}

async function recoverThreadSnapshot(hostId: number, threadId: string) {
  const gateway = useGatewayBootstrapStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = pinnedKey(hostId, threadId);
  const existing = views.threadViews[key];
  const selected = navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId;
  if (existing === undefined && !selected) {
    useGatewayRealtimeStore().cancelThreadEvents(hostId, threadId);
    return;
  }

  await coordinateThreadSnapshot({
    input: {
      hostId,
      threadId,
    },
    accept: () => {
      const stillSelected =
        navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId;
      return stillSelected || views.threadViews[key] !== undefined;
    },
    discard: () => useGatewayRealtimeStore().cancelThreadEvents(hostId, threadId),
    commit: (result) => {
      const stillSelected =
        navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId;
      const retainedView = views.threadViews[key];
      if (stillSelected) {
        // A gap is an explicit declaration that incremental state is incomplete. Replace it with
        // the authoritative snapshot even if its event id is lower after a server restart; the
        // ordinary refresh path intentionally rejects lower ids and is therefore not suitable here.
        applyThreadSnapshotResult(threadId, result, true);
        cacheSelectedThreadView();
      } else {
        upsertThreadView({
          hostId,
          cwd: result.thread.cwd,
          threadId,
          currentThread: result.thread,
          history: result.history,
          events: [...result.recentEvents],
          oldestTimelineCursor: result.oldestTimelineCursor,
          lastEventId: result.lastEventId,
          appliedEventId: retainedView?.appliedEventId ?? result.lastEventId,
          eventEpoch: result.eventEpoch,
          loading: false,
          error: null,
          readOnly: result.readOnly === true,
        });
      }
    },
    fail: (error) =>
      gateway.setError(
        messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
        { hostId, threadId },
      ),
  });
}

function beginPreviewLoad(key: string) {
  const token = Symbol(key);
  previewLoadTokens.set(key, token);
  return token;
}

async function syncOpenThreadFromServer(input: {
  hostId: number;
  threadId: string;
  viewEpoch: number;
  replaceRoute?: boolean;
  showLoading: boolean;
  scrollToLatest?: boolean;
  limit?: number;
}) {
  const gateway = useGatewayBootstrapStore();
  const views = useGatewayThreadViewStore();
  gateway.clearError();
  await coordinateThreadSnapshot({
    input,
    setLoading: input.showLoading
      ? (loading) => {
          if (isCurrentViewTransition(input.viewEpoch)) views.loading = loading;
        }
      : undefined,
    discard: () => {
      const navigation = useGatewayNavigationStore();
      const selected =
        navigation.selectedHostId === input.hostId &&
        navigation.selectedThreadId === input.threadId;
      const retainedHistory = views.threadViews[pinnedKey(input.hostId, input.threadId)]?.history;
      if (!selected && retainedHistory == null) {
        useGatewayRealtimeStore().cancelThreadEvents(input.hostId, input.threadId);
      }
    },
    accept: (result) =>
      !isCurrentViewTransition(input.viewEpoch) ||
      (result.eventEpoch === views.eventEpoch && result.lastEventId < views.lastEventId)
        ? false
        : true,
    commit: (result) => {
      applyThreadSnapshotResult(input.threadId, result);
      cacheSelectedThreadView();
      finishThreadSelection(input.threadId, input.replaceRoute);
      void refreshGoalAfterOpen(input.hostId, input.threadId);
      if (input.scrollToLatest ?? true) requestScrollToLatest();
    },
    fail: (error) =>
      gateway.setError(
        messageFromError(error, gateway.t("app.openThreadFailed"), gateway.errorLabels),
        { hostId: input.hostId, threadId: input.threadId },
      ),
  });
}

function finishThreadSelection(threadId: string, replaceRoute?: boolean) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  rememberOpenThread(threadId);
  syncSelectedRoute({ replace: replaceRoute });
  if (navigation.selectedHostId !== null && !views.readOnly) {
    useGatewayRealtimeStore().connectThreadEvents(
      navigation.selectedHostId,
      threadId,
      views.lastEventId,
      views.eventEpoch,
    );
  }
}

async function refreshGoalAfterOpen(hostId: number, threadId: string) {
  const sessionIsCurrent = captureSessionEpoch();
  const gateway = useGatewayBootstrapStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  try {
    const key = pinnedKey(hostId, threadId);
    if (
      !views.readOnly &&
      !(key in composer.threadGoalObservedAtByKey) &&
      navigation.selectedHostId === hostId &&
      navigation.selectedThreadId === threadId
    ) {
      await composer.refreshSelectedThreadGoal();
    }
  } catch (error: unknown) {
    if (!sessionIsCurrent()) return;
    gateway.setError(
      messageFromError(error, gateway.t("app.refreshThreadGoalFailed"), gateway.errorLabels),
      { hostId, threadId },
    );
  }
}
