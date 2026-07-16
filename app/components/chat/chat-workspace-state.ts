import { storeToRefs } from "pinia";
import { computed } from "vue";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";

export function useChatWorkspaceState() {
  const gatewayRefs = storeToRefs(useGatewayStore());
  const navigationRefs = storeToRefs(useGatewayNavigationStore());
  const runtime = useGatewayThreadRuntimeStore();
  const viewRefs = storeToRefs(useGatewayThreadViewStore());
  const historyTurns = computed(() => threadTurnsFromHistory(viewRefs.history.value));
  const selectedThreadViewReady = computed(() =>
    isSelectedThreadViewReady({
      selectedThreadId: navigationRefs.selectedThreadId.value,
      currentThread: viewRefs.currentThread.value,
      history: viewRefs.history.value,
    }),
  );
  const visibleError = computed(() =>
    scopedVisibleError({
      error: gatewayRefs.error.value,
      selectedHostId: navigationRefs.selectedHostId.value,
      selectedProjectId: navigationRefs.selectedProjectId.value,
      selectedThreadId: navigationRefs.selectedThreadId.value,
    }),
  );
  return {
    ...gatewayRefs,
    ...navigationRefs,
    ...viewRefs,
    historyTurns,
    threadItems: computed(() => historyTurns.value.flatMap((turn: any) => turn.items || [])),
    openingThread: computed(
      () =>
        Boolean(navigationRefs.selectedThreadId.value) &&
        viewRefs.loading.value &&
        historyTurns.value.length === 0,
    ),
    selectedThreadStatus: computed(() => {
      const hostId = navigationRefs.selectedHostId.value;
      const threadId = navigationRefs.selectedThreadId.value;
      return hostId && threadId ? runtime.statusFor(hostId, threadId) : "idle";
    }),
    selectedThreadViewReady,
    visibleError,
    followKey: computed(() => [
      viewRefs.scrollToLatestToken.value,
      navigationRefs.selectedHostId.value,
      navigationRefs.selectedThreadId.value,
    ]),
    canOpenTerminal: computed(() => Boolean(navigationRefs.selectedHostId.value)),
  };
}

function isSelectedThreadViewReady(input: {
  selectedThreadId: string | null;
  currentThread: unknown;
  history: unknown;
}) {
  if (!input.selectedThreadId) return true;
  const selectedThreadId = String(input.selectedThreadId);
  const currentThreadId = threadIdFromUnknown(input.currentThread);
  if (currentThreadId === selectedThreadId) return true;
  const historyValue = input.history as any;
  return (
    (threadIdFromUnknown(historyValue?.thread) ?? threadIdFromUnknown(historyValue)) ===
    selectedThreadId
  );
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
  if (!current) return null;
  if (current.hostId !== null && current.hostId !== input.selectedHostId) return null;
  if (current.projectId !== null && current.projectId !== input.selectedProjectId) return null;
  if (current.threadId !== null && current.threadId !== input.selectedThreadId) return null;
  return current.message;
}
