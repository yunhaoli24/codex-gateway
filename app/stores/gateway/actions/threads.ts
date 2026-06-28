import type { GatewayStoreContext } from "../types";
import { createThreadListActions } from "./thread-list";
import { createThreadOpenActions } from "./thread-open";
import { createThreadPinningActions } from "./thread-pinning";
import { createThreadSettingsActions } from "./thread-settings";
import { createThreadTurnActions } from "./thread-turns";

export function createThreadActions(ctx: GatewayStoreContext) {
  return {
    ...createThreadListActions(ctx),
    ...createThreadSettingsActions(ctx),
    ...createThreadOpenActions(ctx),
    ...createThreadPinningActions(ctx),
    ...createThreadTurnActions(ctx),
  };
}
