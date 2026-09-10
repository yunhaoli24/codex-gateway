import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { gatewayDomainEvents } from "../domain-events";
import { emitNotificationItem } from "./notification-item";
import { formatNotification, isVisibleNotificationMethod } from "./notification-formatters";
import type { GatewayEventHandlerRegistry } from "./types";
import { idFromUnknown } from "~~/shared/utils/records";

const notificationSideEffects: Partial<
  Record<
    string,
    (
      event: import("~~/shared/types").GatewayEvent,
      params: Record<string, unknown>,
      threadId: string,
    ) => void
  >
> = {
  "item/commandExecution/terminalInteraction": (event, params, threadId) => {
    const turnId = idFromUnknown(params.turnId);
    const itemId = idFromUnknown(params.itemId);
    const processId = idFromUnknown(params.processId);
    if (turnId === null || itemId === null || processId === null) return;
    gatewayDomainEvents.emit("terminal-process-detected", {
      hostId: event.hostId,
      threadId,
      turnId: String(turnId),
      itemId: String(itemId),
      processId: String(processId),
    });
  },
};

export const notificationEventHandlers: GatewayEventHandlerRegistry = {
  notice: (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "notice") return;
    const method = canonical.source;
    if (!isVisibleNotificationMethod(method)) return;
    const params = canonical.params;
    const turnId = idFromUnknown(params.turnId);
    if (turnId === null) return;
    notificationSideEffects[method]?.(event, params, threadId);
    const formatted = formatNotification(useGatewayBootstrapStore().t, method, params, {
      hostId: event.hostId,
      threadId,
    });
    emitNotificationItem(event.hostId, threadId, {
      id: `notification-${event.id}`,
      turnId: String(turnId),
      method,
      title: formatted.title,
      level: formatted.level,
      message: formatted.message,
      details: formatted.details,
      params,
    });
  },
};
