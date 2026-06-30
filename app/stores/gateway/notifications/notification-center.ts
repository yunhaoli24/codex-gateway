import { showBrowserNotification, type BrowserNotificationPayload } from "./browser-notifier";
import type { GatewayStoreContext } from "../types";

export function notifyOnce(ctx: GatewayStoreContext, payload: BrowserNotificationPayload) {
  if (ctx.state.deliveredNotificationKeys.includes(payload.key)) {
    return;
  }
  ctx.state.deliveredNotificationKeys = [...ctx.state.deliveredNotificationKeys, payload.key];
  void showBrowserNotification(payload);
}
