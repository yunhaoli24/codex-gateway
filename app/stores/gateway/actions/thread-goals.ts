import type { ThreadGoal, ThreadGoalStatus } from "~~/shared/types";
import { sendRealtimeRequest } from "../realtime/request-response";
import type { GatewayStoreContext } from "../types";
import { pinnedKey } from "../thread-utils/identity";

export function createThreadGoalActions(ctx: GatewayStoreContext) {
  return {
    upsertThreadGoal(hostId: number, threadId: string, goal: ThreadGoal) {
      const key = pinnedKey(hostId, threadId);
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
      const message = await sendRealtimeRequest<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>(ctx, (requestId) => ({
        type: "thread.goal.set",
        requestId,
        hostId: ctx.state.selectedHostId!,
        threadId: ctx.state.selectedThreadId!,
        objective,
        status: "active",
      }));
      ctx.upsertThreadGoal(ctx.state.selectedHostId, ctx.state.selectedThreadId, message.goal);
    },

    async setSelectedThreadGoalStatus(status: ThreadGoalStatus) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const message = await sendRealtimeRequest<{
        type: "thread.goal.updated";
        goal: ThreadGoal;
      }>(ctx, (requestId) => ({
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
      await sendRealtimeRequest(ctx, (requestId) => ({
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
      const message = await sendRealtimeRequest<{
        type: "thread.goal.snapshot";
        goal: ThreadGoal | null;
      }>(ctx, (requestId) => ({
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
