import { ref } from "vue";
import type { ThreadHistoryItem } from "~~/shared/types";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";

/** Both command and MCP disclosures use the official item lookup and the same cache owner. */
export function useDeferredItemOutput(props: {
  item: ThreadHistoryItem;
  hostId?: number | null;
  threadId?: string | null;
}) {
  const loading = ref(false);
  async function onOpen(open: boolean) {
    if (
      !open ||
      props.item.outputDeferred !== true ||
      loading.value ||
      props.hostId == null ||
      props.threadId == null ||
      typeof props.item.turnId !== "string"
    )
      return;
    loading.value = true;
    try {
      await useGatewayThreadTurnsStore().loadItemOutput({
        hostId: props.hostId,
        threadId: props.threadId,
        turnId: props.item.turnId,
        item: props.item,
      });
    } finally {
      loading.value = false;
    }
  }
  return { loadingDeferredOutput: loading, onOutputOpen: onOpen };
}
