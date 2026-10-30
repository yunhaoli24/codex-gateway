import { storeToRefs } from "pinia";
import { computed } from "vue";
import type { GatewayThread, ThreadTimelineHistoryState } from "~~/shared/types";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";

export function useChatWorkspaceState() {
  const bootstrapRefs = storeToRefs(useGatewayBootstrapStore());
  const navigationRefs = storeToRefs(useGatewayNavigationStore());
  const runtime = useGatewayThreadRuntimeStore();
  const viewRefs = storeToRefs(useGatewayThreadViewStore());
  // History is projected at the store reducer boundary. A thread switch only selects the cached
  // reference; projecting here would rescan a long transcript during every workspace render.
  const historyTurns = computed(() => viewRefs.history.value?.thread.turns ?? []);
  const selectedThreadViewReady = computed(() =>
    isSelectedThreadViewReady({
      selectedThreadId: navigationRefs.selectedThreadId.value,
      currentThread: viewRefs.currentThread.value,
      history: viewRefs.history.value,
    }),
  );
  const visibleError = computed(() =>
    scopedVisibleError({
      error: bootstrapRefs.error.value,
      selectedHostId: navigationRefs.selectedHostId.value,
      selectedCwd: navigationRefs.selectedCwd.value,
      selectedThreadId: navigationRefs.selectedThreadId.value,
    }),
  );
  return {
    ...bootstrapRefs,
    ...navigationRefs,
    ...viewRefs,
    selectedThreadReadOnly: computed(() => viewRefs.readOnly.value),
    historyTurns,
    threadItems: computed(() => historyTurns.value.flatMap((turn) => turn.items)),
    openingThread: computed(
      () =>
        navigationRefs.selectedThreadId.value !== null &&
        viewRefs.loading.value &&
        historyTurns.value.length === 0,
    ),
    selectedThreadStatus: computed(() => {
      const hostId = navigationRefs.selectedHostId.value;
      const threadId = navigationRefs.selectedThreadId.value;
      return hostId !== null && threadId !== null ? runtime.statusFor(hostId, threadId) : "idle";
    }),
    selectedThreadViewReady,
    visibleError,
    canOpenTerminal: computed(() => navigationRefs.selectedHostId.value !== null),
  };
}

function isSelectedThreadViewReady(input: {
  selectedThreadId: string | null;
  currentThread: GatewayThread | null;
  history: ThreadTimelineHistoryState | null;
}) {
  if (input.selectedThreadId === null) return true;
  return (
    input.currentThread?.id === input.selectedThreadId ||
    input.history?.thread.id === input.selectedThreadId
  );
}

function scopedVisibleError(input: {
  error: {
    message: string;
    hostId: number | null;
    cwd: string | null;
    threadId: string | null;
  } | null;
  selectedHostId: number | null;
  selectedCwd: string | null;
  selectedThreadId: string | null;
}) {
  const current = input.error;
  if (!current) return null;
  if (current.hostId !== null && current.hostId !== input.selectedHostId) return null;
  if (current.cwd !== null && current.cwd !== input.selectedCwd) return null;
  if (current.threadId !== null && current.threadId !== input.selectedThreadId) return null;
  return current.message;
}
