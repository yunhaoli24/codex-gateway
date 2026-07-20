import { deliverBarkNotification } from "./bark-delivery";
import { notificationRealtimeEvents } from "./notification-realtime-events";
import type { ServerNotification } from "~~/shared/types";
import { gatewayMemoryState } from "../state/memory";

const MAX_PUBLISHED_NOTIFICATION_KEYS = 1_000;

export const notificationCenter = {
  publish(notification: ServerNotification) {
    if (alreadyPublished(notification.key)) {
      return;
    }
    markPublished(notification.key);
    notificationRealtimeEvents.publish(notification);
    deliverBarkNotification(notification);
  },
};

function alreadyPublished(key: string) {
  return gatewayMemoryState.publishedNotificationKeys.includes(key);
}

function markPublished(key: string) {
  gatewayMemoryState.publishedNotificationKeys = [
    ...gatewayMemoryState.publishedNotificationKeys.slice(-(MAX_PUBLISHED_NOTIFICATION_KEYS - 1)),
    key,
  ];
}
