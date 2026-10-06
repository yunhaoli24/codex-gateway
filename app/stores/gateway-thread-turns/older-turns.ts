import { TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import { timelinePageToTurns } from "~~/shared/thread-history/app-server-timeline";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { cacheSelectedThreadView } from "@/stores/gateway/thread-open/view-state";
import { setSelectedThreadHistory } from "@/stores/gateway/thread-open/thread-view-cache";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { isStaleThreadCursorError } from "./stale-cursor";
import { requestThreadTimelinePage } from "./transport";
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
    views.oldestTimelineCursor === null ||
    views.loadingOlderTurns
  ) {
    return;
  }

  const hostId = navigation.selectedHostId;
  const projectId = navigation.selectedProjectId;
  const threadId = navigation.selectedThreadId;
  views.loadingOlderTurns = true;
  try {
    const page = await requestThreadTimelinePage({
      hostId,
      threadId,
      cursor: views.oldestTimelineCursor,
      limit: options.limit ?? TIMELINE_PAGE_LIMIT,
    });
    if (
      !sessionIsCurrent() ||
      navigation.selectedHostId !== hostId ||
      navigation.selectedThreadId !== threadId
    ) {
      return;
    }
    const turns = timelinePageToTurns(page);
    setSelectedThreadHistory(
      mergeThreadTurns(views.history, views.currentThread, threadId, turns, "prepend"),
    );
    views.oldestTimelineCursor = page.nextCursor;
    cacheSelectedThreadView();
  } catch (error: unknown) {
    if (!sessionIsCurrent()) return;
    if (isStaleThreadCursorError(error)) {
      if (navigation.selectedHostId !== hostId || navigation.selectedThreadId !== threadId) {
        return;
      }
      views.oldestTimelineCursor = null;
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
