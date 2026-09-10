import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { threadGoalFromUnknown } from "~~/shared/runtime/app-server";
import type { GatewayEventHandlerRegistry } from "./types";

export const goalEventHandlers: GatewayEventHandlerRegistry = {
  "thread.goal.updated": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "thread.goal.updated") return;
    const goal = threadGoalFromUnknown(canonical.goal);
    if (goal) useGatewayComposerStore().upsertThreadGoal(event.hostId, threadId, goal);
  },
  "thread.goal.cleared": (event, threadId) => {
    useGatewayComposerStore().clearThreadGoalState(event.hostId, threadId);
  },
};
