import type { ThreadGoal, ThreadGoalStatus } from "~~/shared/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import type { GatewayStoreContext } from "../types";
import { pinnedKey } from "../thread-utils/identity";
import {
  goalObjectiveMessageItem,
  shouldInsertGoalObjectiveMessage,
} from "../thread-goals/goal-history";

export function createThreadGoalActions(ctx: GatewayStoreContext) {
  return {
    upsertThreadGoal(
      hostId: number,
      threadId: string,
      goal: ThreadGoal,
      options: { showObjectiveInTimeline?: boolean; turnId?: string | null } = {},
    ) {
      const key = pinnedKey(hostId, threadId);
      const previousGoal = ctx.state.threadGoalsByKey[key];
      if (options.showObjectiveInTimeline && shouldInsertGoalObjectiveMessage(previousGoal, goal)) {
        ctx.events.emit("history-item-upsert", {
          hostId,
          threadId,
          item: goalObjectiveMessageItem(goal, options.turnId),
        });
      }
      ctx.state.threadGoalsByKey = {
        ...ctx.state.threadGoalsByKey,
        [key]: goal,
      };
      ctx.state.threadGoalObservedAtByKey = {
        ...ctx.state.threadGoalObservedAtByKey,
        [key]: Date.now(),
      };
    },

    clearThreadGoalState(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId);
      const { [key]: _goal, ...goals } = ctx.state.threadGoalsByKey;
      const { [key]: _observedAt, ...observedAt } = ctx.state.threadGoalObservedAtByKey;
      ctx.state.threadGoalsByKey = goals;
      ctx.state.threadGoalObservedAtByKey = observedAt;
    },

    async setSelectedThreadGoal(objective: string) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>((requestId) => ({
        type: "thread.goal.set",
        requestId,
        hostId: ctx.state.selectedHostId!,
        threadId: ctx.state.selectedThreadId!,
        objective,
        status: "active",
      }));
      ctx.upsertThreadGoal(ctx.state.selectedHostId, ctx.state.selectedThreadId, message.goal, {
        showObjectiveInTimeline: true,
      });
    },

    async setSelectedThreadGoalStatus(status: ThreadGoalStatus) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>((requestId) => ({
        type: "thread.goal.set",
        requestId,
        hostId: ctx.state.selectedHostId!,
        threadId: ctx.state.selectedThreadId!,
        status,
      }));
      ctx.upsertThreadGoal(ctx.state.selectedHostId, ctx.state.selectedThreadId, message.goal);
    },

    async clearSelectedThreadGoal() {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      await useGatewayRealtimeStore().request((requestId) => ({
        type: "thread.goal.clear",
        requestId,
        hostId: ctx.state.selectedHostId!,
        threadId: ctx.state.selectedThreadId!,
      }));
      ctx.clearThreadGoalState(ctx.state.selectedHostId, ctx.state.selectedThreadId);
    },

    async refreshSelectedThreadGoal() {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const message = await useGatewayRealtimeStore().request<{
        type: "thread.goal.snapshot";
        goal: ThreadGoal | null;
      }>((requestId) => ({
        type: "thread.goal.get",
        requestId,
        hostId: ctx.state.selectedHostId!,
        threadId: ctx.state.selectedThreadId!,
      }));
      if (message.goal) {
        ctx.upsertThreadGoal(ctx.state.selectedHostId, ctx.state.selectedThreadId, message.goal);
      } else {
        ctx.clearThreadGoalState(ctx.state.selectedHostId, ctx.state.selectedThreadId);
      }
    },
  };
}
