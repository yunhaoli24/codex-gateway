import type {
  TmuxMonitor,
  TmuxMonitorListResult,
  TmuxPaneSnapshot,
  TmuxSessionSnapshot,
} from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";

const tmuxApiRoot = (hostId: number) => `/api/hosts/${hostId}/tmux`;

export function fetchTmuxMonitors(hostId: number) {
  return gatewayApi<TmuxMonitorListResult>(`${tmuxApiRoot(hostId)}/monitors`);
}

export function fetchTmuxSessions(hostId: number) {
  return gatewayApi<{ sessions: TmuxSessionSnapshot[] }>(`${tmuxApiRoot(hostId)}/sessions`);
}

export function createTmuxMonitor(hostId: number, pane: TmuxPaneSnapshot) {
  return gatewayApi<TmuxMonitor>(`${tmuxApiRoot(hostId)}/monitors`, {
    method: "POST",
    body: { sessionId: pane.sessionId, paneId: pane.paneId },
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
