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
      if (method === "item/commandExecution/terminalInteraction") {
        emitTerminalProcessDetected(ctx, event.hostId, threadId, params);
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

function emitTerminalProcessDetected(
  ctx: Parameters<GatewayEventHandlerRegistry[string]>[0],
  hostId: number,
  threadId: string,
  params: Record<string, any>,
) {
  if (!params.turnId || !params.itemId || !params.processId) {
    return;
  }
  // Codex only emits terminalInteraction for empty stdin while the process is
  // still live. Treat it as the authoritative signal that interrupt is valid.
  ctx.events.emit({
    type: "terminal-process-detected",
    hostId,
    threadId,
    turnId: String(params.turnId),
    itemId: String(params.itemId),
    processId: String(params.processId),
  });
}
