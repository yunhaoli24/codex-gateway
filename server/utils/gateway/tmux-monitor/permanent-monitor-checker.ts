import type { TmuxSessionSnapshot } from "~~/shared/types";
import { TmuxMonitorRepository } from "./repository";
import type { StoredTmuxMonitor } from "./types";

export class PermanentTmuxMonitorChecker {
  constructor(private readonly repository: TmuxMonitorRepository) {}

  check(monitor: StoredTmuxMonitor, sessions: TmuxSessionSnapshot[]) {
    const pane = logicalPaneFor(monitor, sessions);

    // Permanent rules follow a logical tmux slot, not one pane PID. This lets a training
    // workspace return to shell or recreate the pane without silently losing the watch.
    if (!monitor.runStartedAt) {
      if (!pane) this.repository.recordWaitingCheck(monitor);
      else if (pane.running) this.repository.startPermanentRun(monitor, pane);
      else this.repository.recordChecked(monitor, pane);
      return null;
    }

    if (!pane) {
      const sessionExists = sessions.some((session) => session.name === monitor.sessionName);
      return this.repository.completePermanentRun(
        monitor,
        sessionExists ? "paneExited" : "sessionExited",
        null,
      );
    }

    const replaced = pane.sessionId !== monitor.sessionId || pane.paneId !== monitor.paneId;
    if (replaced) {
      const completed = this.repository.completePermanentRun(monitor, "paneReplaced", pane);
      if (pane.running) this.repository.startPermanentRun(monitor, pane);
      return completed;
    }
    if (!pane.running) {
      return this.repository.completePermanentRun(monitor, "returnedToShell", pane);
    }
    this.repository.recordChecked(monitor, pane);
    return null;
  }
}

export function logicalPaneFor(monitor: StoredTmuxMonitor, sessions: TmuxSessionSnapshot[]) {
  return sessions
    .find((session) => session.name === monitor.sessionName)
    ?.panes.find(
      (pane) => pane.windowIndex === monitor.windowIndex && pane.paneIndex === monitor.paneIndex,
    );
}
