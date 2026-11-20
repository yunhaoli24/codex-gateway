import type { NotificationTranslation } from "../notifications/messages";

export type ServerNotificationTarget =
  | {
      kind: "thread";
      hostId: number;
      threadId: string;
    }
  | {
      kind: "tmuxMonitor";
      hostId: number;
      monitorId: number;
      threadId: string | null;
    };

export interface ServerNotification {
  key: string;
  title: string;
  body: string;
  translation?: NotificationTranslation;
  group?: string | null;
  target: ServerNotificationTarget;
}
