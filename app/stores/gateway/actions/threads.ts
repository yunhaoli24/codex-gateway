import type { GatewayStoreContext } from "../types";
import { createThreadListActions } from "./thread-list";
import { createThreadOpenActions } from "./thread-open";
import { createThreadPinningActions } from "./thread-pinning";
import { createThreadGoalActions } from "./thread-goals";
import { createThreadLiveEventActions } from "./thread-live-events";
import { createThreadRuntimeActions } from "./thread-runtime";
import { createThreadSettingsActions } from "./thread-settings";
import { createSubAgentPanelActions } from "./sub-agent-panels";

export function createThreadActions(ctx: GatewayStoreContext) {
  return {
    ...createThreadListActions(ctx),
    ...createThreadRuntimeActions(ctx),
    ...createThreadLiveEventActions(ctx),
    ...createThreadGoalActions(ctx),
    ...createThreadSettingsActions(ctx),
    ...createThreadOpenActions(ctx),
    ...createSubAgentPanelActions(ctx),
    ...createThreadPinningActions(ctx),
  };
}
