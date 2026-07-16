import { useGatewayStore } from "@/stores/gateway";
import { gatewayDomainEvents } from "../domain-events";
import { emitNotificationItem } from "./notification-item";
import { formatNotification, visibleNotificationMethods } from "./notification-formatters";
import type { GatewayEventHandler, GatewayEventHandlerRegistry } from "./types";

const notificationSideEffects: Partial<Record<string, GatewayEventHandler>> = {
  "item/commandExecution/terminalInteraction": (event, params, threadId) => {
    if (!params.turnId || !params.itemId || !params.processId) return;
    gatewayDomainEvents.emit("terminal-process-detected", {
      hostId: event.hostId,
      threadId,
      turnId: String(params.turnId),
      itemId: String(params.itemId),
      processId: String(params.processId),
    });
  },
};

export const notificationEventHandlers = Object.fromEntries(
  visibleNotificationMethods.map((method) => [
    method,
    ((event, params, threadId) => {
      if (!params.turnId) return;
      notificationSideEffects[method]?.(event, params, threadId);
      const formatted = formatNotification(useGatewayStore().t, method, params, {
        hostId: event.hostId,
        threadId,
      });
      emitNotificationItem(event.hostId, threadId, {
        id: `notification-${event.id}`,
        turnId: params.turnId,
        method,
        title: formatted.title,
        level: formatted.level,
        message: formatted.message,
        details: formatted.details,
        params,
      });
    }) satisfies GatewayEventHandlerRegistry[string],
  ]),
) as GatewayEventHandlerRegistry;
