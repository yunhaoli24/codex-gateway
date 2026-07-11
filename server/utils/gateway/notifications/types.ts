export interface ServerNotification {
  key: string;
  title: string;
  body: string;
  group?: string | null;
  target: {
    hostId: number;
    projectId: number | null;
    threadId: string;
  };
}
