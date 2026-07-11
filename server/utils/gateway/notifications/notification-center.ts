import { deliverBarkNotification } from "./bark-delivery";
import { notificationRealtimeEvents } from "./notification-realtime-events";
import type { ServerNotification } from "./types";

export const notificationCenter = {
  publish(notification: ServerNotification) {
    notificationRealtimeEvents.publish(notification);
    deliverBarkNotification(notification);
  },
};
