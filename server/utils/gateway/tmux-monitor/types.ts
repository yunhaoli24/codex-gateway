import type { TmuxMonitor, TmuxMonitorCompletionReason, TmuxPaneSnapshot } from "~~/shared/types";

export interface StoredTmuxMonitor extends TmuxMonitor {
  userId: number;
  notificationSentAt: string | null;
}

export interface TmuxMonitorHostGroup {
  userId: number;
  hostId: number;
  monitors: StoredTmuxMonitor[];
}

export interface TmuxMonitorCompletion {
  monitor: StoredTmuxMonitor;
  reason: Exclude<TmuxMonitorCompletionReason, "cancelled">;
  pane: TmuxPaneSnapshot | null;
}
