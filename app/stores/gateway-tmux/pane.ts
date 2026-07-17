import type { TmuxMonitor, TmuxPaneSnapshot } from "~~/shared/types";

export function paneSnapshotFromMonitor(monitor: TmuxMonitor): TmuxPaneSnapshot {
  return {
    sessionName: monitor.sessionName,
    sessionId: monitor.sessionId,
    sessionCreated: monitor.sessionCreated,
    windowIndex: monitor.windowIndex,
    windowName: monitor.windowName,
    paneIndex: monitor.paneIndex,
    paneId: monitor.paneId,
    panePid: monitor.panePid,
    currentCommand: monitor.lastCommand,
    running: monitor.status === "active",
  };
}
