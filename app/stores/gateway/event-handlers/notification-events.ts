import { emitNotificationItem } from "./notification-item";
import { formatNotification, visibleNotificationMethods } from "./notification-formatters";
import type { GatewayEventHandlerRegistry } from "./types";

export const notificationEventHandlers = Object.fromEntries(
  visibleNotificationMethods.map((method) => [
    method,
    ((ctx, event, params, threadId) => {
      if (!params.turnId) {
        return;
      }
      const formatted = formatNotification(ctx, method, params, { hostId: event.hostId, threadId });
      emitNotificationItem(ctx, event.hostId, threadId, {
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
