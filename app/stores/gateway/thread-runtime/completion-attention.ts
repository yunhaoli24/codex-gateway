import type { ThreadRuntimeStatus } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { pinnedKey } from "../thread-utils/identity";

export function threadCompletionAttentionKey(hostId: number, threadId: string) {
  return pinnedKey(hostId, threadId);
}

export function clearThreadCompletionAttention(hostId: number, threadId: string) {
  const runtime = useGatewayThreadRuntimeStore();
  const key = threadCompletionAttentionKey(hostId, threadId);
  runtime.unviewedCompletedThreadKeys = runtime.unviewedCompletedThreadKeys.filter(
    (candidate) => candidate !== key,
  );
}

export function syncThreadCompletionAttention(
  hostId: number,
  threadId: string,
  previousStatus: ThreadRuntimeStatus | undefined,
  nextStatus: ThreadRuntimeStatus,
) {
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const key = threadCompletionAttentionKey(hostId, threadId);
  const isSelected =
    navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId;

  if (isSelected || nextStatus === "running") {
    clearThreadCompletionAttention(hostId, threadId);
    return;
  }

  if (
    nextStatus === "completed" &&
    previousStatus === "running" &&
    !runtime.unviewedCompletedThreadKeys.includes(key)
  ) {
    runtime.unviewedCompletedThreadKeys = [...runtime.unviewedCompletedThreadKeys, key];
  }
}
