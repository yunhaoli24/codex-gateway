import { emitNotificationItem } from "./notification-item";
import { formatNotification, visibleNotificationMethods } from "./notification-formatters";
import type {
  AppServerEventParams,
  GatewayEventHandler,
  GatewayEventHandlerRegistry,
} from "./types";

const notificationSideEffects: Partial<Record<string, GatewayEventHandler>> = {
  "item/commandExecution/terminalInteraction": (ctx, event, params, threadId) => {
    emitTerminalProcessDetected(ctx, event.hostId, threadId, params);
  },
};

export const notificationEventHandlers = Object.fromEntries(
  visibleNotificationMethods.map((method) => [
    method,
    ((ctx, event, params, threadId) => {
      if (!params.turnId) {
        return;
      }
      notificationSideEffects[method]?.(ctx, event, params, threadId);
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

function emitTerminalProcessDetected(
  ctx: Parameters<GatewayEventHandlerRegistry[string]>[0],
  hostId: number,
  threadId: string,
  params: AppServerEventParams,
) {
  if (!params.turnId || !params.itemId || !params.processId) {
    return;
  }
  // Codex only emits terminalInteraction for empty stdin while the process is
  // still live. Treat it as the authoritative signal that interrupt is valid.
  ctx.events.emit("terminal-process-detected", {
    hostId,
    threadId,
    turnId: String(params.turnId),
    itemId: String(params.itemId),
    processId: String(params.processId),
  });
}
