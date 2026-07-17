export type TmuxMonitorStatus = "active" | "completed" | "cancelled";
export type TmuxMonitorMode = "once" | "permanent";

export type TmuxMonitorCompletionReason =
  | "returnedToShell"
  | "sessionExited"
  | "paneExited"
  | "paneReplaced"
  | "cancelled";

export interface TmuxPaneSnapshot {
  sessionName: string;
  sessionId: string;
  sessionCreated: number;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  paneId: string;
  panePid: number;
  currentCommand: string;
  running: boolean;
}

export interface TmuxSessionSnapshot {
  name: string;
  sessionId: string;
  sessionCreated: number;
  panes: TmuxPaneSnapshot[];
}

export interface TmuxPaneOutput {
  output: string;
  capturedAt: string;
}

export interface TmuxMonitorThreadBinding {
  projectId: number | null;
  threadId: string;
  threadTitle: string;
}

export interface TmuxMonitor {
  id: number;
  hostId: number;
  projectId: number | null;
  threadId: string | null;
  threadTitle: string | null;
  sessionName: string;
  sessionId: string;
  sessionCreated: number;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  paneId: string;
  panePid: number;
  initialCommand: string;
  lastCommand: string;
  mode: TmuxMonitorMode;
  status: TmuxMonitorStatus;
  completionReason: TmuxMonitorCompletionReason | null;
  createdAt: string;
  runStartedAt: string | null;
  lastCheckedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface TmuxMonitorListResult {
  active: TmuxMonitor[];
  history: TmuxMonitor[];
}
