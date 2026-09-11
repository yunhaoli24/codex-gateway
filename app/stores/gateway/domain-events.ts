import type {
  AppServerThread,
  BrowserPreviewSessionSnapshot,
  BrowserPreviewResourceFailure,
  ThreadHistoryItem,
  RealtimeServerMessage,
  ServerNotification,
  ThreadSettingsState,
  ThreadTokenUsageState,
  TerminalSessionSnapshot,
  GatewayConfig,
  HostGpuProcessSnapshot,
  HostMetricsCollectorStatus,
  HostMetricsSample,
  TmuxSessionsSnapshot,
} from "~~/shared/types";
import type { ThreadRuntimeStatus } from "./types";
import { EventEmitter } from "@posva/event-emitter";

type RealtimeMessage<T extends RealtimeServerMessage["type"]> = Extract<
  RealtimeServerMessage,
  { type: T }
>;

export type GatewayDomainEventMap = {
  "gateway-session-reset": Record<never, never>;
  "gateway-config-applied": { config: GatewayConfig };
  "host-removed": { hostId: number };
  "pinned-threads-invalidated": Record<never, never>;
  "realtime-reconnected": Record<never, never>;
  "realtime-error-reported": {
    message: string;
    hostId: number | null;
    threadId: string | null;
  };
  "realtime-thread-event": { event: GatewayEvent };
  "realtime-thread-events-gap": { hostId: number; threadId: string };
  "history-events-project": { events: GatewayEvent[] };
  "realtime-thread-goal-updated": RealtimeMessage<"thread.goal.updated">;
  "realtime-thread-goal-cleared": RealtimeMessage<"thread.goal.cleared">;
  "realtime-thread-goal-snapshot": RealtimeMessage<"thread.goal.snapshot">;
  "realtime-terminal-opened": { session: TerminalSessionSnapshot };
  "realtime-terminal-snapshot": { sessions: TerminalSessionSnapshot[] };
  "realtime-terminal-closed": { sessionId: string };
  "realtime-terminal-output": { sessionId: string; data: string };
  "realtime-terminal-exited": { sessionId: string; displayMessage: string };
  "realtime-terminal-error": { sessionId?: string; message: string };
  "realtime-browser-opened": { session: BrowserPreviewSessionSnapshot };
  "realtime-browser-closed": { sessionId: string };
  "realtime-browser-error": { message: string };
  "realtime-browser-frame-warning": { sessionId: string; value: string };
  "realtime-browser-resource-failed": {
    sessionId: string;
    failure: BrowserPreviewResourceFailure;
  };
  "realtime-notification-published": {
    notification: ServerNotification;
    actionLabel: string;
  };
  "realtime-host-lifecycle": RealtimeMessage<"host.lifecycle">;
  "realtime-host-mfa-request": {
    hostId: number;
    name: string;
    instructions: string;
    prompts: Array<{ prompt: string; echo?: boolean }>;
  };
  "realtime-host-metrics-snapshot": {
    hostId: number;
    status: HostMetricsCollectorStatus;
    message: string | null;
    samples: HostMetricsSample[];
    gpuProcesses: HostGpuProcessSnapshot | null;
  };
  "realtime-host-metrics-sample": {
    hostId: number;
    sample: HostMetricsSample;
    gpuProcesses: HostGpuProcessSnapshot | null;
  };
  "realtime-host-metrics-status": {
    hostId: number;
    status: HostMetricsCollectorStatus;
    message: string | null;
  };
  "realtime-tmux-sessions": TmuxSessionsSnapshot;
  "thread-summary-detected": {
    hostId: number;
    thread: AppServerThread;
  };
  "thread-status-detected": {
    hostId: number;
    threadId: string;
    status: ThreadRuntimeStatus;
    turnId?: string | null;
  };
  "terminal-process-detected": {
    hostId: number;
    threadId: string;
    turnId: string;
    itemId: string;
    processId: string;
  };
  "terminal-process-completed": {
    hostId: number;
    threadId: string;
    turnId: string;
    itemId: string;
  };
  "remote-files-changed": {
    hostId: number;
    threadId: string;
    paths: string[];
  };
  "file-watch-closed": {
    hostId: number;
    projectId: number;
    threadId: string;
  };
  "thread-settings-detected": {
    hostId: number;
    threadId: string;
    settings: ThreadSettingsState;
  };
  "thread-token-usage-detected": {
    hostId: number;
    threadId: string;
    tokenUsage: ThreadTokenUsageState;
  };
  "history-item-upsert": { hostId: number; threadId: string; item: ThreadHistoryItem };
};

export const gatewayDomainEvents = new EventEmitter<GatewayDomainEventMap>();
