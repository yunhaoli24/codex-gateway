import { mergeTurnItemPage } from "~~/shared/thread-history/item-page";
import { itemId } from "~~/shared/thread-history/item-identity";
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
import { readTurnItemsPage } from "./read-turn-page";
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
  const cursor = turn.olderItemsCursor;
  const pageEndId = turn.itemsPageEndId;
  const loadingKey = turns.turnItemsKey(hostId, threadId, turnId);
  if (turns.loadingTurnItemsByKey[loadingKey] === true) return false;

  const sessionIsCurrent = captureSessionEpoch();
  turns.setTurnItemsLoading(hostId, threadId, turnId, true);
  try {
    const { items, nextCursor, complete } = await readTurnItemsPage({
      hostId,
      threadId,
      turnId,
      cursor,
    });

    if (!sessionIsCurrent() || views.expandedTurnId(hostId, threadId) !== turnId) return false;
    const view = views.threadViews[pinnedKey(hostId, threadId)];
    const history = view?.history;
    if (history === null || history === undefined) return false;
    const nextTurns = history.thread.turns.map((candidate) => {
      if (String(candidate.id) !== turnId) return candidate;
      // Collapsing an old Turn can evict its disclosure while the RPC is in flight. Its retained
      // user message may still exist, so item identity alone cannot prove this is the same page.
      if (candidate.olderItemsCursor !== cursor || candidate.itemsPageEndId !== pageEndId)
        return candidate;
      const merged = mergeTurnItemPage(candidate.items, items, pageEndId);
      if (merged === null) return candidate;
      return {
        ...candidate,
        items: merged,
        itemsView: complete ? ("full" as const) : ("summary" as const),
        olderItemsCursor: nextCursor,
        itemsPageEndId: items.length === 0 ? pageEndId : itemId(items.at(-1)),
      };
    });
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
