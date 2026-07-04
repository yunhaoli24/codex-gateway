import { itemLifecycleReducers } from "./item-lifecycle";
import { pendingServerRequestReducers, serverRequestReducers } from "./server-requests";
import { streamDeltaReducers } from "./stream-deltas";
import { turnLifecycleReducers } from "./turn-lifecycle";
import { AppServerHistoryDispatcher } from "./dispatcher";
import type { AppServerHistoryReducerRegistry } from "./types";

const appServerHistoryReducers: AppServerHistoryReducerRegistry = {
  ...turnLifecycleReducers,
  ...itemLifecycleReducers,
  ...streamDeltaReducers,
  ...serverRequestReducers,
  ...pendingServerRequestReducers,
};

export const appServerHistoryDispatcher = new AppServerHistoryDispatcher(appServerHistoryReducers);

export type { ApplyAppServerEventInput } from "./types";
