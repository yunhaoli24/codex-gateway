import {
  insertSteerItemIntoActiveTurn,
  mergeItemIntoLatestTurn,
} from "~~/shared/thread-history/items";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import type { ThreadHistoryItem, ThreadHistoryTurn } from "~~/shared/thread-history/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { cacheSelectedThreadView } from "@/stores/gateway/thread-open/view-state";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function insertOptimisticSteerMessage(
  threadId: string,
  turnId: string,
  clientUserMessageId: string,
  content: unknown[],
) {
  const views = useGatewayThreadViewStore();
  views.history = insertSteerItemIntoActiveTurn(
    views.history,
    views.currentThread,
    threadId,
    turnId,
    {
      type: "userMessage",
      id: clientUserMessageId,
      clientId: clientUserMessageId,
      turnId,
      content,
    },
  );
  cacheSelectedThreadView();
}

export function insertOptimisticNewTurnMessage(
  threadId: string,
  clientUserMessageId: string,
  content: unknown[],
) {
  const views = useGatewayThreadViewStore();
  views.history = mergeItemIntoLatestTurn(views.history, views.currentThread, threadId, {
    type: "userMessage",
    id: clientUserMessageId,
    clientId: clientUserMessageId,
    content,
  });
  cacheSelectedThreadView();
}

export function mergeStartedTurn(threadId: string, turn: ThreadHistoryTurn) {
  const views = useGatewayThreadViewStore();
  views.history = mergeThreadTurns(views.history, views.currentThread, threadId, [turn], "append");
  cacheSelectedThreadView();
}

export function mergeTurnItems(threadId: string, turn: ThreadHistoryTurn) {
  const views = useGatewayThreadViewStore();
  for (const item of turn.items ?? []) {
    views.history = mergeItemIntoLatestTurn(views.history, views.currentThread, threadId, {
      ...item,
      turnId: turn.id,
    });
  }
}

export function upsertHistoryItem(hostId: number, threadId: string, item: ThreadHistoryItem) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const update = (history: unknown, currentThread: unknown) =>
    mergeItemIntoLatestTurn(history, currentThread, threadId, item);
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    views.history = update(views.history, views.currentThread);
    cacheSelectedThreadView();
    return;
  }
  const key = pinnedKey(hostId, threadId);
  const view = views.threadViews[key];
  if (view) {
    views.threadViews = {
      ...views.threadViews,
      [key]: {
        ...view,
        history: update(view.history, view.currentThread),
      },
    };
  }
}

export function historyForThread(hostId: number, threadId: string) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    return views.history;
  }
  return views.threadViews[pinnedKey(hostId, threadId)]?.history ?? null;
}
