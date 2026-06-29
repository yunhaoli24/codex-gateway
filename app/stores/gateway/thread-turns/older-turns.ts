import type { ThreadTurnsPageResult } from "~~/shared/types";
import { mergeThreadTurns } from "../thread-history/turns";
import { messageFromError } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export async function loadOlderTurns(ctx: GatewayStoreContext) {
  if (
    !ctx.state.selectedHostId ||
    !ctx.state.selectedThreadId ||
    !ctx.state.olderTurnsCursor ||
    ctx.state.loadingOlderTurns
  ) {
    return;
  }

  const hostId = ctx.state.selectedHostId;
  const projectId = ctx.state.selectedProjectId;
  const threadId = ctx.state.selectedThreadId;
  ctx.state.loadingOlderTurns = true;
  try {
    const result = await $fetch<ThreadTurnsPageResult>("/api/threads/turns", {
      query: {
        hostId,
        threadId,
        cursor: ctx.state.olderTurnsCursor,
        limit: 20,
        sortDirection: "desc",
      },
    });
    const turns = (result.history as any)?.thread?.turns ?? [];
    ctx.state.history = mergeThreadTurns(
      ctx.state.history,
      ctx.state.currentThread,
      ctx.state.selectedThreadId,
      turns,
      "prepend",
    );
    ctx.state.olderTurnsCursor = result.turnsPage.nextCursor;
    ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor ?? ctx.state.newerTurnsCursor;
    ctx.cacheSelectedThreadSnapshot();
  } catch (error: any) {
    ctx.setError(messageFromError(error, ctx.t("app.loadOlderTurnsFailed"), ctx.errorLabels), {
      hostId,
      projectId,
      threadId,
    });
  } finally {
    ctx.state.loadingOlderTurns = false;
  }
}
