import type { GatewayStoreContext } from "../types";

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
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  input: NotificationItemInput,
) {
  ctx.events.emit({
    type: "history-item-upsert",
    hostId,
    threadId,
    item: {
      type: "appNotification",
      id: input.id,
      turnId: input.turnId,
      method: input.method,
      title: input.title,
      level: input.level ?? "info",
      message: input.message ?? "",
      details: input.details ?? "",
      params: input.params,
      status: "completed",
    },
  });
}
