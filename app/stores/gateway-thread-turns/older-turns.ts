import { OLDER_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { ThreadTurnsPageResult } from "~~/shared/types";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import type { Translate } from "./types";

export async function loadOlderTurns(t: Translate) {
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
    const result = await gatewayApi<ThreadTurnsPageResult>("/api/threads/turns", {
      query: {
        hostId,
        threadId,
        cursor: gateway.olderTurnsCursor,
        limit: OLDER_TURN_PAGE_LIMIT,
        sortDirection: "desc",
      },
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
    gateway.setError(
      messageFromError(error, t("app.loadOlderTurnsFailed"), errorMessageLabels(t)),
      { hostId, projectId, threadId },
    );
  } finally {
    gateway.loadingOlderTurns = false;
  }
}
