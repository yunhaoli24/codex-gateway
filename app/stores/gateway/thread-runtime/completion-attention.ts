import type { ThreadRuntimeStatus } from "~~/shared/types";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export function threadCompletionAttentionKey(hostId: number, threadId: string) {
  return pinnedKey(hostId, threadId);
}

export function clearThreadCompletionAttention(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
) {
  const key = threadCompletionAttentionKey(hostId, threadId);
  if (!ctx.state.unviewedCompletedThreadKeys.includes(key)) {
    return;
  }
  ctx.state.unviewedCompletedThreadKeys = ctx.state.unviewedCompletedThreadKeys.filter(
    (candidate) => candidate !== key,
  );
}

export function syncThreadCompletionAttention(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  previousStatus: ThreadRuntimeStatus | undefined,
  nextStatus: ThreadRuntimeStatus,
) {
  const key = threadCompletionAttentionKey(hostId, threadId);
  const isSelected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId;

  if (isSelected || nextStatus === "running") {
    clearThreadCompletionAttention(ctx, hostId, threadId);
    return;
  }

  if (
    nextStatus === "completed" &&
    previousStatus === "running" &&
    !ctx.state.unviewedCompletedThreadKeys.includes(key)
  ) {
    ctx.state.unviewedCompletedThreadKeys = [...ctx.state.unviewedCompletedThreadKeys, key];
  }
}
