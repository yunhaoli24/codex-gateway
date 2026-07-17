import { useDocumentVisibility, useElementVisibility, useIntervalFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type { TmuxMonitor, TmuxPaneSnapshot } from "~~/shared/types";
import { useTmuxMonitorDashboard } from "./useTmuxMonitorDashboard";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import type { TmuxRemoteHostState } from "@/stores/gateway-tmux";
import { paneSnapshotFromMonitor } from "@/stores/gateway-tmux/pane";
import { gatewayErrorMessage } from "@/utils/gateway-error";

const EMPTY_REMOTE_STATE: TmuxRemoteHostState = {
  sessions: [],
  scanning: false,
  error: "",
};

export function useTmuxMonitorPanel() {
  const tmux = useGatewayTmuxStore();
  const dashboard = useTmuxMonitorDashboard();
  const { t } = useI18n();
  const addingPaneKey = ref<string | null>(null);
  const expandedHostIds = ref(new Set<number>());
  const panelRoot = ref<HTMLElement | null>(null);
  const panelVisible = useElementVisibility(panelRoot);
  const documentVisibility = useDocumentVisibility();
  const preview = ref<{ hostId: number; pane: TmuxPaneSnapshot } | null>(null);
  const previewHostTitle = computed(() =>
    preview.value
      ? dashboard.hostNames.value[preview.value.hostId] || `Host ${preview.value.hostId}`
      : "",
  );

  function monitoredPaneKeysForHost(hostId: number) {
    return new Set(
      tmux.active
        .filter((monitor) => monitor.hostId === hostId)
        .map((monitor) => `${monitor.sessionId}:${monitor.paneId}`),
    );
  }

  function remoteStateForHost(hostId: number) {
    return tmux.remoteHosts[hostId] ?? EMPTY_REMOTE_STATE;
  }

  function activeCountForHost(hostId: number) {
    return tmux.active.filter((monitor) => monitor.hostId === hostId).length;
  }

  function setHostExpanded(hostId: number, expanded: boolean) {
    const next = new Set(expandedHostIds.value);
    if (expanded) next.add(hostId);
    else next.delete(hostId);
    expandedHostIds.value = next;
    if (expanded) void tmux.refreshSessions(hostId);
  }

  async function refreshExpandedHosts() {
    await Promise.all([...expandedHostIds.value].map((hostId) => tmux.refreshSessions(hostId)));
  }

  const sessionRefresh = useIntervalFn(refreshExpandedHosts, 15_000, {
    immediate: false,
    immediateCallback: false,
  });

  watch(
    [panelVisible, documentVisibility],
    ([visible, documentState]) => {
      // Dockview keeps inactive panels mounted. The interval must follow actual element and
      // document visibility, otherwise a background tmux panel would keep opening SSH channels.
      if (visible && documentState === "visible") sessionRefresh.resume();
      else sessionRefresh.pause();
    },
    { immediate: true },
  );

  watch(
    [() => tmux.panelOpen, dashboard.currentHostId],
    ([open, hostId]) => {
      // Opening the dashboard from a conversation should reveal that Host immediately.
      // Other Hosts remain lazy: expanding their tree node starts the singleflight SSH scan.
      if (open && hostId) setHostExpanded(hostId, true);
    },
    { immediate: true },
  );

  async function addMonitor(hostId: number, pane: TmuxPaneSnapshot) {
    const binding = dashboard.currentThreadBindingForHost(hostId);
    const paneKey = `${hostId}:${pane.sessionId}:${pane.paneId}`;
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
    addingPaneKey,
    expandedHostIds,
    panelRoot,
    preview,
    previewHostTitle,
    monitoredPaneKeysForHost,
    remoteStateForHost,
    activeCountForHost,
    setHostExpanded,
    addMonitor,
    cancelMonitor,
    monitorAgain,
    previewPane,
    previewMonitor,
  };
}
