import { gatewayDomainEvents } from "../domain-events";

export interface NotificationItemInput {
  id: string;
  turnId: string;
  method: string;
  title: string;
  level?: "info" | "warning";
  message?: string;
  details?: string;
  params?: Record<string, any>;
}

export function emitNotificationItem(
  hostId: number,
  threadId: string,
  input: NotificationItemInput,
) {
  gatewayDomainEvents.emit("history-item-upsert", {
    hostId,
    threadId,
    item: {
      type: "appNotification",
      ...input,
      level: input.level ?? "info",
      message: input.message ?? "",
      details: input.details ?? "",
      status: "completed",
    },
  });
}
