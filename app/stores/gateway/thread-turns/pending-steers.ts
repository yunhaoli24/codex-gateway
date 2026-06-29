import type { ComposerTurnOptions } from "~~/shared/types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";
import { activeRemoteTurnId } from "./active-turn";
import { insertOptimisticSteerMessage } from "./optimistic-history";
import { steerActiveTurn } from "./turn-transport";

export function queuePendingSteer(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  steer: {
    text: string;
    clientUserMessageId: string;
    content: any[];
    images: ComposerTurnOptions["images"];
  },
) {
  const key = pinnedKey(hostId, threadId);
  ctx.state.pendingSteersByKey = {
    ...ctx.state.pendingSteersByKey,
    [key]: [
      ...(ctx.state.pendingSteersByKey[key] ?? []),
      {
        text: steer.text,
        clientUserMessageId: steer.clientUserMessageId,
        content: steer.content,
        images: steer.images ?? [],
      },
    ],
  };
}

export async function flushPendingSteers(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
) {
  const key = pinnedKey(hostId, threadId);
  const pending = ctx.state.pendingSteersByKey[key] ?? [];
  if (!pending.length) {
    return;
  }
  const selected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId;
  if (!selected) {
    return;
  }
  const expectedTurnId = activeRemoteTurnId(ctx.state.history);
  if (!expectedTurnId) {
    return;
  }
  ctx.state.pendingSteersByKey = {
    ...ctx.state.pendingSteersByKey,
    [key]: [],
  };
  for (const steer of pending) {
    insertOptimisticSteerMessage(
      ctx,
      threadId,
      expectedTurnId,
      steer.clientUserMessageId,
      steer.content,
    );
    try {
      await steerActiveTurn(ctx, steer.text, steer.clientUserMessageId, expectedTurnId, {
        images: steer.images,
      });
    } catch (error: any) {
      ctx.setError(messageFromError(error, ctx.t("app.sendSteerFailed"), ctx.errorLabels), {
        hostId,
        projectId: ctx.state.selectedProjectId,
        threadId,
      });
    }
  }
}
