import { deltaEventHandlers } from "./delta-events";
import { errorEventHandlers } from "./error-events";
import { goalEventHandlers } from "./goal-events";
import { itemEventHandlers } from "./item-events";
import { notificationEventHandlers } from "./notification-events";
import { requestEventHandlers } from "./request-events";
import { threadEventHandlers } from "./thread-events";
import { turnEventHandlers } from "./turn-events";
import type { GatewayEventHandlerRegistry } from "./types";

export const appServerEventHandlers: GatewayEventHandlerRegistry = {
  ...threadEventHandlers,
  ...goalEventHandlers,
  ...turnEventHandlers,
  ...itemEventHandlers,
  ...deltaEventHandlers,
  ...requestEventHandlers,
  ...errorEventHandlers,
  ...notificationEventHandlers,
};
