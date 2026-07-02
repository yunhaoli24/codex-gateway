import type { GatewayStoreContext } from "../types";
import { createThreadListActions } from "./thread-list";
import { createThreadOpenActions } from "./thread-open";
import { createThreadPinningActions } from "./thread-pinning";
import { createThreadGoalActions } from "./thread-goals";
import { createThreadSettingsActions } from "./thread-settings";
import { createThreadTurnActions } from "./thread-turns";
import { createSubAgentPanelActions } from "./sub-agent-panels";

export function createThreadActions(ctx: GatewayStoreContext) {
  return {
    ...createThreadListActions(ctx),
    ...createThreadGoalActions(ctx),
    ...createThreadSettingsActions(ctx),
    ...createThreadOpenActions(ctx),
    ...createSubAgentPanelActions(ctx),
    ...createThreadPinningActions(ctx),
    ...createThreadTurnActions(ctx),
  };
}
