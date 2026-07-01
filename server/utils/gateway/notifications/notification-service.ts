import { normalizeNotificationSettings } from "~~/shared/config";
import { gatewayMemoryState } from "../state/memory";
import { sendBarkNotification } from "./bark-provider";
import type { ServerNotification } from "./types";

const MAX_DELIVERED_NOTIFICATION_KEYS = 1_000;

export const serverNotificationService = {
  dispatch(notification: ServerNotification) {
    if (alreadyDelivered(notification.key)) {
      return;
    }
    markDelivered(notification.key);

    const settings = normalizeNotificationSettings(gatewayMemoryState.notifications);
    if (!settings.bark.enabled || !settings.bark.deviceKey) {
      return;
    }

    void sendBarkNotification(settings.bark, notification).catch((error) => {
      console.error("[gateway] Bark notification failed", {
        key: notification.key,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  },
};

function alreadyDelivered(key: string) {
  return gatewayMemoryState.deliveredNotificationKeys.includes(key);
}

function markDelivered(key: string) {
  gatewayMemoryState.deliveredNotificationKeys = [
    ...gatewayMemoryState.deliveredNotificationKeys.slice(-(MAX_DELIVERED_NOTIFICATION_KEYS - 1)),
    key,
  ];
}
