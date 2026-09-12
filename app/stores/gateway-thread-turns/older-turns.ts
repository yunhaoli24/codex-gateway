import { CLIENT_THREAD_TURN_CACHE_LIMIT, OLDER_TURN_PAGE_LIMIT } from "~~/shared/config";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { cacheSelectedThreadView } from "@/stores/gateway/thread-open/view-state";
import { setSelectedThreadHistory } from "@/stores/gateway/thread-open/thread-view-cache";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { isStaleThreadCursorError } from "./stale-cursor";
import { requestThreadTurnsPage } from "./transport";
import type { Translate } from "./types";
import { captureSessionEpoch } from "@/utils/session-epoch";

export async function loadOlderTurns(t: Translate, options: { limit?: number } = {}) {
  const sessionIsCurrent = captureSessionEpoch();
  const gateway = useGatewayBootstrapStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (
    navigation.selectedHostId === null ||
    navigation.selectedThreadId === null ||
    views.olderTurnsCursor === null ||
    views.loadingOlderTurns
  ) {
    return;
  }

  const hostId = navigation.selectedHostId;
  const projectId = navigation.selectedProjectId;
  const threadId = navigation.selectedThreadId;
  // This is a recent-turn FIFO cache, not a second history store. Once it is full, older-page
  // loading would immediately evict the page just fetched while realtime events continue to
  // append normally. Stop pagination silently instead of surfacing a recoverable cache condition
  // as an error and keep the opaque cursor for a later fresh activation.
  if (threadTurnsFromHistory(views.history).length >= CLIENT_THREAD_TURN_CACHE_LIMIT) {
    return;
  }
  views.loadingOlderTurns = true;
  try {
    const result = await requestThreadTurnsPage({
      hostId,
      threadId,
      cursor: views.olderTurnsCursor,
      limit: options.limit ?? OLDER_TURN_PAGE_LIMIT,
      sortDirection: "desc",
    });
    if (
      !sessionIsCurrent() ||
      navigation.selectedHostId !== hostId ||
      navigation.selectedThreadId !== threadId
    ) {
      return;
    }
    const turns = threadTurnsFromHistory(result.history);
    setSelectedThreadHistory(
      mergeThreadTurns(views.history, views.currentThread, threadId, turns, "prepend"),
    );
    views.olderTurnsCursor = result.turnsPage.nextCursor;
    views.newerTurnsCursor = result.turnsPage.backwardsCursor ?? views.newerTurnsCursor;
    cacheSelectedThreadView();
  } catch (error: unknown) {
    if (!sessionIsCurrent()) return;
    if (isStaleThreadCursorError(error)) {
      if (navigation.selectedHostId !== hostId || navigation.selectedThreadId !== threadId) {
        return;
      }
      views.olderTurnsCursor = null;
      views.newerTurnsCursor = null;
      cacheSelectedThreadView();
      await views.refreshSelectedThreadSnapshot({ showLoading: false, scrollToLatest: false });
      return;
    }
    gateway.setError(
      messageFromError(error, t("app.loadOlderTurnsFailed"), errorMessageLabels(t)),
      { hostId, projectId, threadId },
    );
  } finally {
    if (
      sessionIsCurrent() &&
      navigation.selectedHostId === hostId &&
      navigation.selectedThreadId === threadId
    ) {
      views.loadingOlderTurns = false;
    }
  }
}
