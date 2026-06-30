export interface BrowserNotificationPayload {
  key: string;
  title: string;
  body?: string;
}

export async function showBrowserNotification(payload: BrowserNotificationPayload) {
  if (!import.meta.client || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") {
    return false;
  }
  new Notification(payload.title, { body: payload.body });
  return true;
}
