import type { BarkNotificationSettings } from "~~/shared/types";
import type { ServerNotification } from "./types";

export async function sendBarkNotification(
  settings: BarkNotificationSettings,
  notification: ServerNotification,
) {
  const url = buildBarkUrl(settings, notification);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Bark notification failed with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function buildBarkUrl(settings: BarkNotificationSettings, notification: ServerNotification) {
  const base = settings.serverUrl.replace(/\/+$/, "");
  const url = new URL(
    `${base}/${encodeURIComponent(settings.deviceKey)}/${encodeURIComponent(notification.title)}/${encodeURIComponent(notification.body)}`,
  );
  const group = notification.group?.trim() || settings.group?.trim();
  if (group) {
    url.searchParams.set("group", group);
  }
  return url;
}
