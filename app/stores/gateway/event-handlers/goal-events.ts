import type { GatewayEventHandlerRegistry } from "./types";

export const goalEventHandlers: GatewayEventHandlerRegistry = {
  "thread/goal/updated": (ctx, event, params, threadId) => {
    if (!params.goal) {
      return;
    }
    // Goal progress updates are status-strip state, not new timeline items.
    // The explicit /goal submission inserts the single historical goal card.
    ctx.upsertThreadGoal(event.hostId, threadId, params.goal);
  },
  "thread/goal/cleared": (ctx, event, _params, threadId) => {
    ctx.clearThreadGoalState(event.hostId, threadId);
  },
};
