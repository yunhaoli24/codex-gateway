import {
  insertSteerItemIntoActiveTurn,
  mergeItemIntoLatestTurn,
} from "~~/shared/thread-history/items";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import { useGatewayStore } from "@/stores/gateway";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function insertOptimisticSteerMessage(
  threadId: string,
  turnId: string,
  clientUserMessageId: string,
  content: any[],
) {
  const gateway = useGatewayStore();
  gateway.history = insertSteerItemIntoActiveTurn(
    gateway.history,
    gateway.currentThread,
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
  gateway.cacheSelectedThreadView();
}

export function insertOptimisticNewTurnMessage(
  threadId: string,
  clientUserMessageId: string,
  content: any[],
) {
  const gateway = useGatewayStore();
  gateway.history = mergeItemIntoLatestTurn(gateway.history, gateway.currentThread, threadId, {
    type: "userMessage",
    id: clientUserMessageId,
    clientId: clientUserMessageId,
    content,
  });
  gateway.cacheSelectedThreadView();
}

export function mergeStartedTurn(threadId: string, turn: any) {
  const gateway = useGatewayStore();
  gateway.history = mergeThreadTurns(
    gateway.history,
    gateway.currentThread,
    threadId,
    [turn],
    "append",
  );
  gateway.cacheSelectedThreadView();
}

export function mergeTurnItems(threadId: string, turn: any) {
  const gateway = useGatewayStore();
  for (const item of turn.items ?? []) {
    gateway.history = mergeItemIntoLatestTurn(gateway.history, gateway.currentThread, threadId, {
      ...item,
      turnId: turn.id,
    });
  }
}

export function upsertHistoryItem(hostId: number, threadId: string, item: Record<string, any>) {
  const gateway = useGatewayStore();
  const update = (history: unknown, currentThread: unknown) =>
    mergeItemIntoLatestTurn(history, currentThread, threadId, item);
  if (gateway.selectedHostId === hostId && gateway.selectedThreadId === threadId) {
    gateway.history = update(gateway.history, gateway.currentThread);
    gateway.cacheSelectedThreadView();
    return;
  }
  const key = pinnedKey(hostId, threadId);
  const view = gateway.threadViews[key];
  if (view) {
    gateway.threadViews = {
      ...gateway.threadViews,
      [key]: {
        ...view,
        history: update(view.history, view.currentThread),
      },
    };
  }
}

export function historyForThread(hostId: number, threadId: string) {
  const gateway = useGatewayStore();
  if (gateway.selectedHostId === hostId && gateway.selectedThreadId === threadId) {
    return gateway.history;
  }
  return gateway.threadViews[pinnedKey(hostId, threadId)]?.history ?? null;
}
