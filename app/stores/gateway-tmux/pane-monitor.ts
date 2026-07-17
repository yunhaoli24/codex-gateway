import type { TmuxMonitor, TmuxPaneSnapshot } from "~~/shared/types";

export function monitorForPane(monitors: TmuxMonitor[], hostId: number, pane: TmuxPaneSnapshot) {
  return monitors.find((monitor) => {
    if (monitor.hostId !== hostId) return false;
    if (monitor.mode === "once") {
      return monitor.sessionId === pane.sessionId && monitor.paneId === pane.paneId;
    }
    // Permanent monitors intentionally match the logical tmux slot. Their pane id and PID
    // are allowed to change when tmux recreates a pane between training runs.
    return (
      monitor.sessionName === pane.sessionName &&
      monitor.windowIndex === pane.windowIndex &&
      monitor.paneIndex === pane.paneIndex
    );
  });
}
