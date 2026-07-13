import { storeToRefs } from "pinia";
import { computed } from "vue";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import type { useGatewayStore } from "@/stores/gateway";

export function useChatWorkspaceState(store: ReturnType<typeof useGatewayStore>) {
  const refs = storeToRefs(store);
  const selectedThreadViewReady = computed(() =>
    isSelectedThreadViewReady({
      selectedThreadId: refs.selectedThreadId.value,
      currentThread: refs.currentThread.value,
      history: refs.history.value,
    }),
  );
  const historyTurns = computed(() => threadTurnsFromHistory(refs.history.value));
  const threadItems = computed(() => historyTurns.value.flatMap((turn: any) => turn.items || []));
  const openingThread = computed(
    () =>
      Boolean(refs.selectedThreadId.value) && refs.loading.value && historyTurns.value.length === 0,
  );
  const visibleError = computed(() =>
    scopedVisibleError({
      error: refs.error.value,
      selectedHostId: refs.selectedHostId.value,
      selectedProjectId: refs.selectedProjectId.value,
      selectedThreadId: refs.selectedThreadId.value,
    }),
  );
  const followKey = computed(() => [
    refs.scrollToLatestToken.value,
    refs.selectedHostId.value,
    refs.selectedThreadId.value,
  ]);

  return {
    ...refs,
    historyTurns,
    threadItems,
    openingThread,
    selectedThreadViewReady,
    visibleError,
    followKey,
    canOpenTerminal: computed(() => Boolean(refs.selectedHostId.value)),
  };
}

function isSelectedThreadViewReady(input: {
  selectedThreadId: string | null;
  currentThread: unknown;
  history: unknown;
}) {
  if (!input.selectedThreadId) {
    return true;
  }
  const selectedThreadId = String(input.selectedThreadId);
  const currentThreadId = threadIdFromUnknown(input.currentThread);
  if (currentThreadId === selectedThreadId) {
    return true;
  }
  const historyValue = input.history as any;
  const historyThreadId =
    threadIdFromUnknown(historyValue?.thread) ?? threadIdFromUnknown(historyValue);
  return historyThreadId === selectedThreadId;
}

function threadIdFromUnknown(value: unknown) {
  const id = (value as any)?.id;
  return id == null ? null : String(id);
}

function scopedVisibleError(input: {
  error: {
    message: string;
    hostId: number | null;
    projectId: number | null;
    threadId: string | null;
  } | null;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
}) {
  const current = input.error;
  if (!current) {
    return null;
  }
  if (current.hostId !== null && current.hostId !== input.selectedHostId) {
    return null;
  }
  if (current.projectId !== null && current.projectId !== input.selectedProjectId) {
    return null;
  }
  if (current.threadId !== null && current.threadId !== input.selectedThreadId) {
    return null;
  }
  return current.message;
}
