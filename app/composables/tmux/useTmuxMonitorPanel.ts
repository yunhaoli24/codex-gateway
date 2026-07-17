import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import type { TmuxMonitor, TmuxPaneSnapshot } from "~~/shared/types";
import { useTmuxMonitorDashboard } from "./useTmuxMonitorDashboard";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { paneSnapshotFromMonitor } from "@/stores/gateway-tmux/pane";
import { gatewayErrorMessage } from "@/utils/gateway-error";

export function useTmuxMonitorPanel() {
  const tmux = useGatewayTmuxStore();
  const dashboard = useTmuxMonitorDashboard();
  const { t } = useI18n();
  const remoteState = computed(() =>
    tmux.selectedHostId ? tmux.remoteStateFor(tmux.selectedHostId) : null,
  );
  const monitoredPaneKeys = computed(
    () =>
      new Set(
        tmux.active
          .filter((monitor) => monitor.hostId === tmux.selectedHostId)
          .map((monitor) => `${monitor.sessionId}:${monitor.paneId}`),
      ),
  );
  const addingPaneKey = ref<string | null>(null);
  const preview = ref<{ hostId: number; pane: TmuxPaneSnapshot } | null>(null);
  const previewHostTitle = computed(() =>
    preview.value
      ? dashboard.hostNames.value[preview.value.hostId] || `Host ${preview.value.hostId}`
      : "",
  );

  async function addMonitor(pane: TmuxPaneSnapshot) {
    if (!tmux.selectedHostId) return;
    const hostId = tmux.selectedHostId;
    const binding = dashboard.selectedThreadBinding.value;
    const paneKey = `${pane.sessionId}:${pane.paneId}`;
    if (addingPaneKey.value) return;
    addingPaneKey.value = paneKey;
    try {
      await tmux.addMonitor(hostId, pane, binding);
      toast.success(
        t("app.tmuxMonitorAdded", {
          session: pane.sessionName,
          host: dashboard.hostNames.value[hostId] || `Host ${hostId}`,
          thread: binding?.threadTitle || t("app.tmuxHostLevelMonitor"),
        }),
      );
    } catch (error) {
      toast.error(gatewayErrorMessage(error, t("app.tmuxAddFailed")));
    } finally {
      addingPaneKey.value = null;
    }
  }

  async function cancelMonitor(monitor: TmuxMonitor) {
    try {
      await tmux.cancelMonitor(monitor.hostId, monitor.id);
    } catch (error) {
      toast.error(gatewayErrorMessage(error, t("app.tmuxCancelFailed")));
    }
  }

  async function monitorAgain(monitor: TmuxMonitor) {
    await tmux.refreshSessions(monitor.hostId);
    const state = tmux.remoteStateFor(monitor.hostId);
    const pane = state.sessions
      .find((candidate) => candidate.name === monitor.sessionName)
      ?.panes.find(
        (candidate) =>
          candidate.windowIndex === monitor.windowIndex &&
          candidate.paneIndex === monitor.paneIndex &&
          candidate.running,
      );
    if (!pane) {
      toast.error(state.error || t("app.tmuxPreviousPaneUnavailable"));
      return;
    }
    const binding = monitor.threadId
      ? {
          projectId: monitor.projectId,
          threadId: monitor.threadId,
          threadTitle: monitor.threadTitle || monitor.threadId,
        }
      : null;
    try {
      await tmux.addMonitor(monitor.hostId, pane, binding);
      toast.success(
        t("app.tmuxMonitorAdded", {
          session: pane.sessionName,
          host: dashboard.hostNames.value[monitor.hostId] || `Host ${monitor.hostId}`,
          thread: binding?.threadTitle || t("app.tmuxHostLevelMonitor"),
        }),
      );
    } catch (error) {
      toast.error(gatewayErrorMessage(error, t("app.tmuxAddFailed")));
    }
  }

  function previewPane(hostId: number, pane: TmuxPaneSnapshot) {
    preview.value = { hostId, pane };
  }

  function previewMonitor(monitor: TmuxMonitor) {
    previewPane(monitor.hostId, paneSnapshotFromMonitor(monitor));
  }

  return {
    tmux,
    dashboard,
    remoteState,
    monitoredPaneKeys,
    addingPaneKey,
    preview,
    previewHostTitle,
    addMonitor,
    cancelMonitor,
    monitorAgain,
    previewPane,
    previewMonitor,
  };
}
