import { mergeTurnItems } from "~~/shared/thread-history/item-merge";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { patchThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import {
  errorMessageLabels,
  messageFromError,
  pinnedKey,
} from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { readTurnTimelinePage } from "./read-turn-page";
import type { Translate } from "./types";

export async function loadTurnItems(t: Translate, turnId: string) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const turns = useGatewayThreadTurnsStore();
  const hostId = navigation.selectedHostId;
  const threadId = navigation.selectedThreadId;
  if (hostId === null || threadId === null) return false;

  const turn = views.history?.thread.turns.find((candidate) => candidate.id === turnId);
  if (turn === undefined || turn.itemsView === "full") return true;
  const loadingKey = turns.turnItemsKey(hostId, threadId, turnId);
  if (turns.loadingTurnItemsByKey[loadingKey] === true) return false;

  const sessionIsCurrent = captureSessionEpoch();
  turns.setTurnItemsLoading(hostId, threadId, turnId, true);
  try {
    const { items, nextCursor, complete } = await readTurnTimelinePage({
      hostId,
      threadId,
      turnId,
      cursor: turn.olderItemsCursor,
      sessionIsCurrent,
    });

    if (!sessionIsCurrent()) return false;
    const view = views.threadViews[pinnedKey(hostId, threadId)];
    const history = view?.history;
    if (history === null || history === undefined) return false;
    const nextTurns = history.thread.turns.map((candidate) =>
      String(candidate.id) === turnId
        ? {
            ...candidate,
            items: mergeTurnItems(items, candidate.items ?? []),
            itemsView: complete ? ("full" as const) : ("summary" as const),
            olderItemsCursor: nextCursor,
          }
        : candidate,
    );
    // Commit one bounded page atomically. Do not accumulate every page before publishing: a turn
    // can contain thousands of intermediate items even though only a handful fit the viewport.
    patchThreadView(hostId, threadId, {
      history: { thread: { ...history.thread, turns: nextTurns } },
    });
    return true;
  } catch (error: unknown) {
    if (sessionIsCurrent()) {
      useGatewayBootstrapStore().setError(
        messageFromError(error, t("app.loadTurnItemsFailed"), errorMessageLabels(t)),
        { hostId, threadId, turnId },
      );
    }
    return false;
  } finally {
    turns.setTurnItemsLoading(hostId, threadId, turnId, false);
  }
}
