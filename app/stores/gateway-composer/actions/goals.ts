import type { ThreadGoal, ThreadGoalStatus } from "~~/shared/types";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import { threadGoalTimelineItem } from "@/stores/gateway/thread-goals/goal-timeline";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function createThreadGoalActions() {
  function upsertThreadGoal(
    hostId: number,
    threadId: string,
    goal: ThreadGoal,
    options: { showInTimeline?: boolean; turnId?: string | null } = {},
  ) {
    const composer = useGatewayComposerStore();
    const key = pinnedKey(hostId, threadId);
    if (options.showInTimeline) {
      const item = threadGoalTimelineItem(goal, options.turnId);
      if (item) gatewayDomainEvents.emit("history-item-upsert", { hostId, threadId, item });
    }
    composer.threadGoalsByKey = { ...composer.threadGoalsByKey, [key]: goal };
    composer.threadGoalObservedAtByKey = {
      ...composer.threadGoalObservedAtByKey,
      [key]: Date.now(),
    };
  }

  function clearThreadGoalState(hostId: number, threadId: string) {
    const composer = useGatewayComposerStore();
    const key = pinnedKey(hostId, threadId);
    const { [key]: _goal, ...goals } = composer.threadGoalsByKey;
    composer.threadGoalsByKey = goals;
    composer.threadGoalObservedAtByKey = {
      ...composer.threadGoalObservedAtByKey,
      [key]: Date.now(),
    };
  }

  return {
    upsertThreadGoal,
    clearThreadGoalState,
    async setSelectedThreadGoal(objective: string) {
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      const { selectedHostId: hostId, selectedThreadId: threadId } = navigation;
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>((requestId) => ({
        type: "thread.goal.set",
        requestId,
        hostId,
        threadId,
        objective,
        status: "active",
      }));
      upsertThreadGoal(hostId, threadId, message.goal, { showInTimeline: true });
    },
    async setSelectedThreadGoalStatus(status: ThreadGoalStatus) {
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      const { selectedHostId: hostId, selectedThreadId: threadId } = navigation;
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>((requestId) => ({
        type: "thread.goal.set",
        requestId,
        hostId,
        threadId,
        status,
      }));
      upsertThreadGoal(hostId, threadId, message.goal);
    },
    async clearSelectedThreadGoal() {
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      const { selectedHostId: hostId, selectedThreadId: threadId } = navigation;
      await useGatewayRealtimeStore().request((requestId) => ({
        type: "thread.goal.clear",
        requestId,
        hostId,
        threadId,
      }));
      clearThreadGoalState(hostId, threadId);
    },
    async refreshSelectedThreadGoal() {
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      const { selectedHostId: hostId, selectedThreadId: threadId } = navigation;
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.snapshot";
        goal: ThreadGoal | null;
      }>((requestId) => ({
        type: "thread.goal.get",
        requestId,
        hostId,
        threadId,
      }));
      if (message.goal) upsertThreadGoal(hostId, threadId, message.goal);
      else clearThreadGoalState(hostId, threadId);
    },
  };
}
