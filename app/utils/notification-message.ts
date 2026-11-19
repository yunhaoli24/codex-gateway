import type { ServerNotification } from "~~/shared/types";
import type { GatewayTranslate } from "@/composables/i18n/useGatewayTranslator";
import { threadItemStatusLabel } from "./thread-item-status";

const tmuxReasonKeys: Record<string, string> = {
  returnedToShell: "app.tmuxReasonReturnedToShell",
  sessionExited: "app.tmuxReasonSessionExited",
  paneExited: "app.tmuxReasonPaneExited",
  paneReplaced: "app.tmuxReasonPaneReplaced",
  cancelled: "app.tmuxReasonCancelled",
  completed: "app.completed",
};

export function notificationMessage(notification: ServerNotification, t: GatewayTranslate) {
  const translation = notification.translation;
  if (translation === undefined) return notification;
  const values = { ...translation.values };
  if (typeof values.status === "string") values.status = threadItemStatusLabel(values.status, t);
  if (translation.kind === "inputRequested") {
    values.questionCount =
      typeof values.count === "number" && values.count > 1
        ? t("app.serverNotifications.questionCount", { count: values.count })
        : "";
    if (values.question === "") values.question = t("app.serverNotifications.openQuestions");
  }
  if (translation.kind === "tmuxCompleted") {
    if (values.thread === "") values.thread = t("app.tmuxHostLevelMonitor");
    const reason = tmuxReasonKeys[String(values.reason)];
    if (reason !== undefined) values.reason = t(reason);
  }
  return {
    ...notification,
    title: t(`app.serverNotifications.${translation.kind}.title`, values),
    body: t(`app.serverNotifications.${translation.kind}.body`, values),
  };
}
