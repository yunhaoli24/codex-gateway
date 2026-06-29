import { deltaEventHandlers } from "./delta-events";
import { itemEventHandlers } from "./item-events";
import { requestEventHandlers } from "./request-events";
import { threadEventHandlers } from "./thread-events";
import { turnEventHandlers } from "./turn-events";
import type { GatewayEventHandlerRegistry } from "./types";

export const appServerEventHandlers: GatewayEventHandlerRegistry = {
  ...threadEventHandlers,
  ...turnEventHandlers,
  ...itemEventHandlers,
  ...deltaEventHandlers,
  ...requestEventHandlers,
};
