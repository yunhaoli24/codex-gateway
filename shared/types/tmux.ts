export type TmuxMonitorStatus = "active" | "completed" | "cancelled";

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

export interface TmuxMonitor {
  id: number;
  hostId: number;
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
  status: TmuxMonitorStatus;
  completionReason: TmuxMonitorCompletionReason | null;
  createdAt: string;
  lastCheckedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface TmuxMonitorListResult {
  active: TmuxMonitor[];
  history: TmuxMonitor[];
}
