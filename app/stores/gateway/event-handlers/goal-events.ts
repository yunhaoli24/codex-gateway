import { useGatewayComposerStore } from "@/stores/gateway-composer";
import type { GatewayEventHandlerRegistry } from "./types";

export const goalEventHandlers: GatewayEventHandlerRegistry = {
  "thread/goal/updated": (event, params, threadId) => {
    if (params.goal)
      useGatewayComposerStore().upsertThreadGoal(event.hostId, threadId, params.goal);
  },
  "thread/goal/cleared": (event, _params, threadId) => {
    useGatewayComposerStore().clearThreadGoalState(event.hostId, threadId);
  },
};
