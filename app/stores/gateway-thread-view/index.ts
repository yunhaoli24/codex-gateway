import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { retainThreadHistory } from "~~/shared/thread-history/retention";
import type {
  GatewayEvent,
  GatewayThread,
  ThreadHistoryState,
  ThreadTimelineHistoryState,
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
  const history = ref<ThreadTimelineHistoryState | null>(null);
  const events = ref<GatewayEvent[]>([]);
  const loading = ref(false);
  const loadingOlderTurns = ref(false);
  const oldestTimelineCursor = ref<string | null>(null);
  const lastEventId = ref(0);
  const appliedEventId = ref(0);
  const eventEpoch = ref("");
  const scrollToLatestToken = ref(0);
  const expandedTurnsByThread = new Map<string, string>();
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
      return;
    }
    // Server snapshots and pages already arrive projected. Client reducers can still create a new
    // generic history object for live deltas or optimistic input, so normalize only at that data
    // mutation boundary. Thread activation restores both refs directly from threadViews and must
    // not call this function merely because the selected route changed.
    const navigation = useGatewayNavigationStore();
    const projected = projectThreadTimelineHistory(
      retainThreadHistory(
        nextHistory,
        expandedTurnId(navigation.selectedHostId, nextHistory.thread.id),
      )!,
    );
    history.value = projected;
  }

  function resetCurrentView() {
    currentThread.value = null;
    history.value = null;
    events.value = [];
    loading.value = false;
    loadingOlderTurns.value = false;
    oldestTimelineCursor.value = null;
    lastEventId.value = 0;
    appliedEventId.value = 0;
    eventEpoch.value = "";
  }

  function resetState() {
    liveEventActions.resetLiveEvents();
    threadViews.value = {};
    expandedTurnsByThread.clear();
    subAgentPanels.value = [];
    viewEpoch.value = 0;
    scrollToLatestToken.value = 0;
    resetCurrentView();
  }

  function expandedTurnId(hostId: number | null, threadId: string) {
    return expandedTurnsByThread.get(`${hostId}:${threadId}`);
  }

  function setExpandedTurn(hostId: number, threadId: string, turnId: string | null) {
    const key = `${hostId}:${threadId}`;
    if (turnId === null) expandedTurnsByThread.delete(key);
    else expandedTurnsByThread.set(key, turnId);
    const view = threadViews.value[key];
    const navigation = useGatewayNavigationStore();
    const selected =
      navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId;
    // The selected projection can be newer than its cached view during a reducer commit. Never
    // restore the older cached object from a disclosure watcher and overwrite just-arrived items.
    const source = selected ? history.value : view?.history;
    if (source == null) return;
    const retained = retainThreadHistory(source, expandedTurnId(hostId, threadId));
    if (retained === source) return;
    const projected = projectThreadTimelineHistory(retained!);
    if (view !== undefined) view.history = projected;
    if (selected) history.value = projected;
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
    oldestTimelineCursor,
    lastEventId,
    appliedEventId,
    eventEpoch,
    scrollToLatestToken,
    visibleSubAgentPanels,
    expandedTurnId,
    setExpandedTurn,
    setHistory,
    resetCurrentView,
    resetState,
    ...actions,
  };
});
