import { OLDER_TURN_PAGE_LIMIT } from "~~/shared/config";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { isStaleThreadCursorError } from "./stale-cursor";
import { requestThreadTurnsPage } from "./transport";
import type { Translate } from "./types";

export async function loadOlderTurns(t: Translate, options: { limit?: number } = {}) {
  const gateway = useGatewayStore();
  if (
    !gateway.selectedHostId ||
    !gateway.selectedThreadId ||
    !gateway.olderTurnsCursor ||
    gateway.loadingOlderTurns
  ) {
    return;
  }

  const hostId = gateway.selectedHostId;
  const projectId = gateway.selectedProjectId;
  const threadId = gateway.selectedThreadId;
  gateway.loadingOlderTurns = true;
  try {
    const result = await requestThreadTurnsPage({
      hostId,
      threadId,
      cursor: gateway.olderTurnsCursor,
      limit: options.limit ?? OLDER_TURN_PAGE_LIMIT,
      sortDirection: "desc",
    });
    const turns = (result.history as any)?.thread?.turns ?? [];
    gateway.history = mergeThreadTurns(
      gateway.history,
      gateway.currentThread,
      threadId,
      turns,
      "prepend",
    );
    gateway.olderTurnsCursor = result.turnsPage.nextCursor;
    gateway.newerTurnsCursor = result.turnsPage.backwardsCursor ?? gateway.newerTurnsCursor;
    gateway.cacheSelectedThreadView();
  } catch (error: any) {
    if (isStaleThreadCursorError(error)) {
      if (gateway.selectedHostId !== hostId || gateway.selectedThreadId !== threadId) {
        return;
      }
      gateway.olderTurnsCursor = null;
      gateway.newerTurnsCursor = null;
      gateway.cacheSelectedThreadView();
      await gateway.refreshSelectedThreadSnapshot({ showLoading: false, scrollToLatest: false });
      return;
    }
    gateway.setError(
      messageFromError(error, t("app.loadOlderTurnsFailed"), errorMessageLabels(t)),
      { hostId, projectId, threadId },
    );
  } finally {
    gateway.loadingOlderTurns = false;
  }
}
