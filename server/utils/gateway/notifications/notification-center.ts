import { deliverBarkNotification } from "./bark-delivery";
import { notificationRealtimeEvents } from "./notification-realtime-events";
import type { ServerNotification } from "~~/shared/types";

export const notificationCenter = {
  publish(notification: ServerNotification) {
    notificationRealtimeEvents.publish(notification);
    deliverBarkNotification(notification);
  },
};
