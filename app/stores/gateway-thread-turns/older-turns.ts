import { OLDER_TURN_PAGE_LIMIT } from "~~/shared/config";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { cacheSelectedThreadView } from "@/stores/gateway/thread-open/view-state";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { isStaleThreadCursorError } from "./stale-cursor";
import { requestThreadTurnsPage } from "./transport";
import type { Translate } from "./types";

export async function loadOlderTurns(t: Translate, options: { limit?: number } = {}) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (
    !navigation.selectedHostId ||
    !navigation.selectedThreadId ||
    !views.olderTurnsCursor ||
    views.loadingOlderTurns
  ) {
    return;
  }

  const hostId = navigation.selectedHostId;
  const projectId = navigation.selectedProjectId;
  const threadId = navigation.selectedThreadId;
  views.loadingOlderTurns = true;
  try {
    const result = await requestThreadTurnsPage({
      hostId,
      threadId,
      cursor: views.olderTurnsCursor,
      limit: options.limit ?? OLDER_TURN_PAGE_LIMIT,
      sortDirection: "desc",
    });
    const turns = threadTurnsFromHistory(result.history);
    views.history = mergeThreadTurns(
      views.history,
      views.currentThread,
      threadId,
      turns,
      "prepend",
    );
    views.olderTurnsCursor = result.turnsPage.nextCursor;
    views.newerTurnsCursor = result.turnsPage.backwardsCursor ?? views.newerTurnsCursor;
    cacheSelectedThreadView();
  } catch (error: unknown) {
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
    views.loadingOlderTurns = false;
  }
}
