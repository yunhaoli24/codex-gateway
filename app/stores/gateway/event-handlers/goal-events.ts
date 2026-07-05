import type { GatewayEventHandlerRegistry } from "./types";

export const goalEventHandlers: GatewayEventHandlerRegistry = {
  "thread/goal/updated": (ctx, event, params, threadId) => {
    if (!params.goal) {
      return;
    }
    ctx.upsertThreadGoal(event.hostId, threadId, params.goal, {
      showObjectiveInTimeline: true,
      turnId: params.turnId ? String(params.turnId) : null,
    });
  },
  "thread/goal/cleared": (ctx, event, _params, threadId) => {
    ctx.clearThreadGoalState(event.hostId, threadId);
  },
};
