import type {
  TmuxMonitor,
  TmuxMonitorListResult,
  TmuxMonitorMode,
  TmuxPaneSnapshot,
  TmuxPaneOutput,
  TmuxMonitorThreadBinding,
} from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";

// Preserve the route pattern across this helper, so Nuxt 4.6 can validate each derived endpoint.
const tmuxApiRoot = (hostId: number): `/api/hosts/${number}/tmux` => `/api/hosts/${hostId}/tmux`;

export function fetchTmuxMonitors() {
  return gatewayApi<TmuxMonitorListResult>("/api/tmux/monitors");
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
  mode: TmuxMonitorMode,
) {
  return gatewayApi<TmuxMonitor>(`${tmuxApiRoot(hostId)}/monitors`, {
    method: "POST",
    body: { mode, sessionId: pane.sessionId, paneId: pane.paneId, thread },
  });
}

export function promoteTmuxMonitor(hostId: number, monitorId: number) {
  return gatewayApi<TmuxMonitor>(`${tmuxApiRoot(hostId)}/monitors/${monitorId}/promote`, {
    method: "POST",
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
