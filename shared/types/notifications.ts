export type ServerNotificationTarget =
  | {
      kind: "thread";
      hostId: number;
      projectId: number | null;
      threadId: string;
    }
  | {
      kind: "tmuxMonitor";
      hostId: number;
      monitorId: number;
    };

export interface ServerNotification {
  key: string;
  title: string;
  body: string;
  group?: string | null;
  target: ServerNotificationTarget;
}
