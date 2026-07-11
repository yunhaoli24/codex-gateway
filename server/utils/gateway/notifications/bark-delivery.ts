import { normalizeNotificationSettings } from "~~/shared/config";
import { gatewayMemoryState } from "../state/memory";
import { sendBarkNotification } from "./bark-provider";
import type { ServerNotification } from "./types";

const MAX_DELIVERED_NOTIFICATION_KEYS = 1_000;

export function deliverBarkNotification(notification: ServerNotification) {
  const settings = normalizeNotificationSettings(gatewayMemoryState.notifications).bark;
  if (!settings.enabled || !settings.deviceKey) {
    return;
  }
  if (alreadyDelivered(notification.key) || deliveryPending(notification.key)) {
    return;
  }
  markPending(notification.key);

  void sendBarkNotification(settings, notification)
    .then(() => markDelivered(notification.key))
    .catch((error) => {
      console.error("[gateway] Bark notification failed", {
        key: notification.key,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => clearPending(notification.key));
}

function alreadyDelivered(key: string) {
  return gatewayMemoryState.deliveredNotificationKeys.includes(key);
}

function deliveryPending(key: string) {
  return gatewayMemoryState.pendingNotificationKeys.includes(key);
}

function markPending(key: string) {
  gatewayMemoryState.pendingNotificationKeys = [...gatewayMemoryState.pendingNotificationKeys, key];
}

function clearPending(key: string) {
  gatewayMemoryState.pendingNotificationKeys = gatewayMemoryState.pendingNotificationKeys.filter(
    (candidate) => candidate !== key,
  );
}

function markDelivered(key: string) {
  gatewayMemoryState.deliveredNotificationKeys = [
    ...gatewayMemoryState.deliveredNotificationKeys.slice(-(MAX_DELIVERED_NOTIFICATION_KEYS - 1)),
    key,
  ];
}
