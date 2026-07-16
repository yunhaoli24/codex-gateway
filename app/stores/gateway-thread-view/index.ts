import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { GatewayEvent } from "~~/shared/types";
import type { SubAgentPanelState, ThreadViewState } from "@/stores/gateway/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { createThreadLiveEventActions } from "./actions/live-events";
import { createSubAgentPanelActions } from "./actions/sub-agent-panels";
import { createThreadOpenActions } from "./actions/thread-open";

export const useGatewayThreadViewStore = defineStore("gateway-thread-view", () => {
  const threadViews = ref<Record<string, ThreadViewState>>({});
  const subAgentPanels = ref<SubAgentPanelState[]>([]);
  const viewEpoch = ref(0);
  const currentThread = ref<unknown>(null);
  const history = ref<unknown>(null);
  const events = ref<GatewayEvent[]>([]);
  const loading = ref(false);
  const loadingOlderTurns = ref(false);
  const olderTurnsCursor = ref<string | null>(null);
  const newerTurnsCursor = ref<string | null>(null);
  const lastEventId = ref(0);
  const scrollToLatestToken = ref(0);
  const actions = {
    ...createThreadLiveEventActions(),
    ...createThreadOpenActions(),
    ...createSubAgentPanelActions(),
  };

  const visibleSubAgentPanels = computed(() => {
    const navigation = useGatewayNavigationStore();
    if (!navigation.selectedHostId || !navigation.selectedThreadId) return [];
    return subAgentPanels.value.filter(
      (panel) =>
        panel.parentHostId === navigation.selectedHostId &&
        panel.parentThreadId === navigation.selectedThreadId,
    );
  });

  function resetCurrentView() {
    currentThread.value = null;
    history.value = null;
    events.value = [];
    loading.value = false;
    loadingOlderTurns.value = false;
    olderTurnsCursor.value = null;
    newerTurnsCursor.value = null;
    lastEventId.value = 0;
  }

  function resetState() {
    threadViews.value = {};
    subAgentPanels.value = [];
    viewEpoch.value = 0;
    scrollToLatestToken.value = 0;
    resetCurrentView();
  }

  return {
    threadViews,
    subAgentPanels,
    viewEpoch,
    currentThread,
    history,
    events,
    loading,
    loadingOlderTurns,
    olderTurnsCursor,
    newerTurnsCursor,
    lastEventId,
    scrollToLatestToken,
    visibleSubAgentPanels,
    resetCurrentView,
    resetState,
    ...actions,
  };
});
