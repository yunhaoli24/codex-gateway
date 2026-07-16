import type { BarkNotificationSettings } from "~~/shared/types";
import type { ServerNotification } from "~~/shared/types";

const BARK_REQUEST_TIMEOUT_MS = 10_000;
const BARK_RETRY_DELAYS_MS = [1_000, 3_000] as const;

export async function sendBarkNotification(
  settings: BarkNotificationSettings,
  notification: ServerNotification,
) {
  const url = buildBarkUrl(settings, notification);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await sendBarkRequest(url);
      return;
    } catch (error) {
      const retryDelay = BARK_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        throw error;
      }
      await delay(retryDelay);
    }
  }
}

async function sendBarkRequest(url: URL) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(BARK_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Bark notification failed with HTTP ${response.status}`);
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
