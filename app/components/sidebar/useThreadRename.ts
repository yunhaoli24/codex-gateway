import { storeToRefs } from "pinia";
import { nextTick, ref } from "vue";
import type { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

type GatewayStore = ReturnType<typeof useGatewayStore>;

export function useThreadRename(store: GatewayStore) {
  const { threads, pinnedThreads } = storeToRefs(store);
  const renamingThreadId = ref<string | null>(null);
  const renameValue = ref("");
  const renameKeyHandlers: Record<string, (event: KeyboardEvent) => void> = {
    Escape: (event) => {
      event.preventDefault();
      cancelRename();
    },
  };

  function startInlineRename(thread: any) {
    renamingThreadId.value = String(thread.threadId || thread.id);
    renameValue.value = titleForThread(thread);
    void nextTick(() => {
      document.querySelector<HTMLInputElement>('[data-testid="rename-thread-input"]')?.focus();
    });
  }

  async function submitRename() {
    const threadId = renamingThreadId.value ?? "";
    const name = renameValue.value.trim();
    if (!threadId || !name) {
      cancelRename();
      return;
    }
    const thread =
      threads.value.find((candidate) => String(candidate.id) === threadId) ||
      pinnedThreads.value.find((candidate) => String(candidate.threadId) === threadId);
    if (thread && titleForThread(thread) === name) {
      cancelRename();
      return;
    }
    await store.renameThread(threadId, name);
    renamingThreadId.value = null;
    renameValue.value = "";
  }

  function cancelRename() {
    renamingThreadId.value = null;
    renameValue.value = "";
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    renameKeyHandlers[event.key]?.(event);
  }

  return {
    renamingThreadId,
    renameValue,
    startInlineRename,
    submitRename,
    handleRenameKeydown,
  };
}
