import {
  insertSteerItemIntoActiveTurn,
  mergeItemIntoLatestTurn,
} from "~~/shared/thread-history/items";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";
import type { GatewayStoreContext } from "../types";

export function insertOptimisticSteerMessage(
  ctx: GatewayStoreContext,
  threadId: string,
  turnId: string,
  clientUserMessageId: string,
  content: any[],
) {
  ctx.state.history = insertSteerItemIntoActiveTurn(
    ctx.state.history,
    ctx.state.currentThread,
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
  ctx.cacheSelectedThreadSnapshot();
}

export function insertOptimisticNewTurnMessage(
  ctx: GatewayStoreContext,
  threadId: string,
  clientUserMessageId: string,
  content: any[],
) {
  ctx.state.history = mergeItemIntoLatestTurn(
    ctx.state.history,
    ctx.state.currentThread,
    threadId,
    {
      type: "userMessage",
      id: clientUserMessageId,
      clientId: clientUserMessageId,
      content,
    },
  );
  ctx.cacheSelectedThreadSnapshot();
}

export function mergeStartedTurn(ctx: GatewayStoreContext, threadId: string, turn: any) {
  ctx.state.history = mergeThreadTurns(
    ctx.state.history,
    ctx.state.currentThread,
    threadId,
    [turn],
    "append",
  );
  ctx.cacheSelectedThreadSnapshot();
}

export function mergeTurnItems(ctx: GatewayStoreContext, threadId: string, turn: any) {
  for (const item of turn.items ?? []) {
    ctx.state.history = mergeItemIntoLatestTurn(
      ctx.state.history,
      ctx.state.currentThread,
      threadId,
      {
        ...item,
        turnId: turn.id,
      },
    );
  }
}
