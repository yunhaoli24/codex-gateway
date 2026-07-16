import type {
  TmuxMonitor,
  TmuxMonitorListResult,
  TmuxPaneSnapshot,
  TmuxPaneOutput,
  TmuxSessionSnapshot,
  TmuxMonitorThreadBinding,
} from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";

const tmuxApiRoot = (hostId: number) => `/api/hosts/${hostId}/tmux`;

export function fetchTmuxMonitors(hostId: number) {
  return gatewayApi<TmuxMonitorListResult>(`${tmuxApiRoot(hostId)}/monitors`);
}

export function fetchTmuxSessions(hostId: number) {
  return gatewayApi<{ sessions: TmuxSessionSnapshot[] }>(`${tmuxApiRoot(hostId)}/sessions`);
}

export function fetchTmuxPaneOutput(hostId: number, pane: TmuxPaneSnapshot) {
  return gatewayApi<TmuxPaneOutput>(`${tmuxApiRoot(hostId)}/panes/output`, {
    query: { sessionId: pane.sessionId, paneId: pane.paneId },
  });
}

export function createTmuxMonitor(
  hostId: number,
  pane: TmuxPaneSnapshot,
  thread: TmuxMonitorThreadBinding | null,
) {
  return gatewayApi<TmuxMonitor>(`${tmuxApiRoot(hostId)}/monitors`, {
    method: "POST",
    body: { sessionId: pane.sessionId, paneId: pane.paneId, thread },
  });
}

export function deleteTmuxMonitor(hostId: number, monitorId: number) {
  return gatewayApi(`${tmuxApiRoot(hostId)}/monitors/${monitorId}`, { method: "DELETE" });
}

export function checkTmuxMonitors(hostId: number) {
  return gatewayApi<TmuxMonitorListResult>(`${tmuxApiRoot(hostId)}/monitors/check`, {
    method: "POST",
  });
}
