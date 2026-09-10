import { deltaEventHandlers } from "./delta-events";
import { errorEventHandlers } from "./error-events";
import { goalEventHandlers } from "./goal-events";
import { itemEventHandlers } from "./item-events";
import { notificationEventHandlers } from "./notification-events";
import { threadEventHandlers } from "./thread-events";
import { turnEventHandlers } from "./turn-events";
import { mcpRuntimeEventHandlers } from "./mcp-events";
import { AppServerEventDispatcher } from "./dispatcher";
import type { GatewayEventHandlerRegistry } from "./types";

const appServerEventHandlers: GatewayEventHandlerRegistry = {
  ...threadEventHandlers,
  ...goalEventHandlers,
  ...turnEventHandlers,
  ...itemEventHandlers,
  ...deltaEventHandlers,
  ...errorEventHandlers,
  ...notificationEventHandlers,
  ...mcpRuntimeEventHandlers,
};

export const appServerEventDispatcher = new AppServerEventDispatcher(appServerEventHandlers);
