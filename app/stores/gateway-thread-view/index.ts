import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { retainRecentThreadTurns } from "~~/shared/thread-history/retention";
import type {
  GatewayEvent,
  GatewayThread,
  ThreadHistoryState,
  ThreadTimelineTurn,
} from "~~/shared/types";
import type { SubAgentPanelState, ThreadViewState } from "@/stores/gateway/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { createThreadLiveEventActions } from "./actions/live-events";
import { createSubAgentPanelActions } from "./actions/sub-agent-panels";
import { createThreadOpenActions } from "./actions/thread-open";

export const useGatewayThreadViewStore = defineStore("gateway-thread-view", () => {
  const threadViews = ref<Record<string, ThreadViewState>>({});
  const subAgentPanels = ref<SubAgentPanelState[]>([]);
  const viewEpoch = ref(0);
  const currentThread = ref<GatewayThread | null>(null);
  const history = ref<ThreadHistoryState | null>(null);
  const timelineTurns = ref<ThreadTimelineTurn[]>([]);
  const events = ref<GatewayEvent[]>([]);
  const loading = ref(false);
  const loadingOlderTurns = ref(false);
  const olderTurnsCursor = ref<string | null>(null);
  const newerTurnsCursor = ref<string | null>(null);
  const lastEventId = ref(0);
  const eventEpoch = ref("");
  const scrollToLatestToken = ref(0);
  const liveEventActions = createThreadLiveEventActions();
  const actions = {
    ...liveEventActions,
    ...createThreadOpenActions(),
    ...createSubAgentPanelActions(),
  };

  const visibleSubAgentPanels = computed(() => {
    const navigation = useGatewayNavigationStore();
    if (navigation.selectedHostId === null || navigation.selectedThreadId === null) return [];
    return subAgentPanels.value.filter(
      (panel) =>
        panel.parentHostId === navigation.selectedHostId &&
        panel.parentThreadId === navigation.selectedThreadId,
    );
  });

  function setHistory(nextHistory: ThreadHistoryState | null) {
    if (nextHistory === null) {
      history.value = null;
      timelineTurns.value = [];
      return;
    }
    // Server snapshots and pages already arrive projected. Client reducers can still create a new
    // generic history object for live deltas or optimistic input, so normalize only at that data
    // mutation boundary. Thread activation restores both refs directly from threadViews and must
    // not call this function merely because the selected route changed.
    const projected = projectThreadTimelineHistory(retainRecentThreadTurns(nextHistory)!);
    history.value = projected;
    timelineTurns.value = projected.thread.turns;
  }

  function resetCurrentView() {
    currentThread.value = null;
    history.value = null;
    timelineTurns.value = [];
    events.value = [];
    loading.value = false;
    loadingOlderTurns.value = false;
    olderTurnsCursor.value = null;
    newerTurnsCursor.value = null;
    lastEventId.value = 0;
    eventEpoch.value = "";
  }

  function resetState() {
    liveEventActions.resetLiveEvents();
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
    timelineTurns,
    events,
    loading,
    loadingOlderTurns,
    olderTurnsCursor,
    newerTurnsCursor,
    lastEventId,
    eventEpoch,
    scrollToLatestToken,
    visibleSubAgentPanels,
    setHistory,
    resetCurrentView,
    resetState,
    ...actions,
  };
});
