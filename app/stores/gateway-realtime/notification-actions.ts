import type { ServerNotification, ServerNotificationTarget } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";

type NotificationAction = { labelKey: string; run: () => void };
type NotificationTargetKind = ServerNotificationTarget["kind"];
type TargetFor<K extends NotificationTargetKind> = Extract<ServerNotificationTarget, { kind: K }>;

const actionFactories: {
  [K in NotificationTargetKind]: (target: TargetFor<K>) => NotificationAction;
} = {
  thread: (target) => ({
    labelKey: "app.openThread",
    run: () => {
      void useGatewayThreadViewStore().openThread(target.threadId, {
        hostId: target.hostId,
        projectId: target.projectId,
      });
    },
  }),
  tmuxMonitor: (target) => ({
    labelKey: "app.openTmuxMonitor",
    run: () => {
      void openTmuxMonitor(target);
    },
  }),
};

export function notificationAction(notification: ServerNotification) {
  const target = notification.target;
  const factory = actionFactories[target.kind] as (value: typeof target) => NotificationAction;
  return factory(target);
}

export function projectPublishedNotification(notification: ServerNotification) {
  if (notification.target.kind !== "tmuxMonitor") return;
  useGatewayTmuxStore().handleCompletion(notification.target.hostId, notification.target.monitorId);
}

async function openTmuxMonitor(target: TargetFor<"tmuxMonitor">) {
  if (target.threadId) {
    await useGatewayThreadViewStore().openThread(target.threadId, {
      hostId: target.hostId,
      projectId: target.projectId,
    });
  } else if (useGatewayNavigationStore().selectedHostId !== target.hostId) {
    await useGatewayStore().selectHost(target.hostId);
  }
  useGatewayTmuxStore().openPanel(target.hostId, target.monitorId);
}
