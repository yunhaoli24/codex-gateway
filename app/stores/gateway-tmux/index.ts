import { computed, ref } from "vue";
import { defineStore } from "pinia";
import pLimit from "p-limit";
import type {
  TmuxMonitor,
  TmuxMonitorMode,
  TmuxMonitorThreadBinding,
  TmuxPaneSnapshot,
  TmuxSessionSnapshot,
} from "~~/shared/types";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { TMUX_WORKSPACE_PANEL_ID } from "@/stores/gateway/workspace-panels";
import { gatewayErrorMessage } from "@/utils/gateway-error";
import {
  checkTmuxMonitors,
  createTmuxMonitor,
  deleteTmuxMonitor,
  fetchTmuxMonitors,
  fetchTmuxSessions,
  promoteTmuxMonitor,
} from "./transport";

export interface TmuxRemoteHostState {
  sessions: TmuxSessionSnapshot[];
  scanning: boolean;
  error: string;
}

interface OpenTmuxPanelTarget {
  monitorId?: number | null;
}

export const useGatewayTmuxStore = defineStore(
  "gateway-tmux",
  () => {
    const { t } = useI18n();
    const panelOpen = ref(false);
    const active = ref<TmuxMonitor[]>([]);
    const history = ref<TmuxMonitor[]>([]);
    const loading = ref(false);
    const error = ref("");
    const loadedAt = ref(0);
    const highlightedMonitorId = ref<number | null>(null);
    const remoteHosts = ref<Record<number, TmuxRemoteHostState>>({});
    const pendingScans = new Map<number, Promise<TmuxRemoteHostState>>();
    const scanLimit = pLimit(2);
    let pendingSummary: Promise<void> | null = null;
    let sessionGeneration = 0;

    const activeCount = computed(() => active.value.length);
    const oneShotActive = computed(() => active.value.filter((monitor) => monitor.mode === "once"));
    const permanentActive = computed(() =>
      active.value.filter((monitor) => monitor.mode === "permanent"),
    );

    function remoteStateFor(hostId: number) {
      const existing = remoteHosts.value[hostId];
      if (existing) return existing;
      const state = createRemoteState();
      remoteHosts.value = { ...remoteHosts.value, [hostId]: state };
      return state;
    }

    function updateRemoteState(hostId: number, patch: Partial<TmuxRemoteHostState>) {
      const state = { ...remoteStateFor(hostId), ...patch };
      // Dockview keeps inactive renderers mounted. Replacing the Host entry, rather
      // than mutating a nested array in place, gives Vue an explicit dependency change
      // across that renderer boundary and prevents successful scans rendering as empty.
      remoteHosts.value = { ...remoteHosts.value, [hostId]: state };
      return state;
    }

    async function loadSummary(force = false) {
      if (!force && loadedAt.value && Date.now() - loadedAt.value < 30_000) return;
      if (pendingSummary) {
        const previousRequest = pendingSummary;
        if (!force) return await previousRequest;
        // A mutation must not reuse a request that started before the write. Wait for
        // that read to settle, then issue a fresh query so cards and the global badge
        // always reflect the completed create/cancel operation.
        await previousRequest;
        if (pendingSummary && pendingSummary !== previousRequest) return await pendingSummary;
      }
      const request = loadSummaryNow();
      const trackedRequest = request.finally(() => {
        if (pendingSummary === trackedRequest) pendingSummary = null;
      });
      pendingSummary = trackedRequest;
      return await pendingSummary;
    }

    async function loadSummaryNow() {
      const generation = sessionGeneration;
      loading.value = true;
      error.value = "";
      try {
        const monitors = await fetchTmuxMonitors();
        if (generation !== sessionGeneration) return;
        active.value = monitors.active;
        history.value = monitors.history;
        loadedAt.value = Date.now();
      } catch (loadError) {
        if (generation !== sessionGeneration) return;
        error.value = gatewayErrorMessage(loadError, t("app.tmuxLoadFailed"));
      } finally {
        if (generation === sessionGeneration) loading.value = false;
      }
    }

    async function scanSessions(hostId: number) {
      const pending = pendingScans.get(hostId);
      if (pending) return await pending;
      // A user may expand many Hosts. Keep the dashboard responsive without creating a burst of
      // browser requests; the server applies the authoritative shared SSH-channel limit as well.
      const request = scanLimit(() => scanSessionsNow(hostId));
      const trackedRequest = request.finally(() => {
        if (pendingScans.get(hostId) === trackedRequest) pendingScans.delete(hostId);
      });
      pendingScans.set(hostId, trackedRequest);
      return await trackedRequest;
    }

    async function scanSessionsNow(hostId: number) {
      const generation = sessionGeneration;
      updateRemoteState(hostId, { scanning: true, error: "" });
      try {
        const result = await fetchTmuxSessions(hostId);
        if (generation !== sessionGeneration) return createRemoteState();
        updateRemoteState(hostId, { sessions: result.sessions });
      } catch (scanError) {
        if (generation !== sessionGeneration) return createRemoteState();
        updateRemoteState(hostId, {
          error: gatewayErrorMessage(scanError, t("app.tmuxScanFailed")),
        });
      } finally {
        if (generation === sessionGeneration) updateRemoteState(hostId, { scanning: false });
      }
      return remoteStateFor(hostId);
    }

    async function addMonitor(
      hostId: number,
      pane: TmuxPaneSnapshot,
      thread: TmuxMonitorThreadBinding | null,
      mode: TmuxMonitorMode,
    ) {
      const monitor = await createTmuxMonitor(hostId, pane, thread, mode);
      await loadSummary(true);
      return monitor;
    }

    async function promoteMonitor(hostId: number, monitorId: number) {
      const monitor = await promoteTmuxMonitor(hostId, monitorId);
      await loadSummary(true);
      return monitor;
    }

    async function cancelMonitor(hostId: number, monitorId: number) {
      await deleteTmuxMonitor(hostId, monitorId);
      await loadSummary(true);
    }

    async function checkNow(hostId: number) {
      updateRemoteState(hostId, { scanning: true, error: "" });
      try {
        const monitors = await checkTmuxMonitors(hostId);
        active.value = monitors.active;
        history.value = monitors.history;
        loadedAt.value = Date.now();
        await scanSessions(hostId);
      } catch (checkError) {
        updateRemoteState(hostId, {
          error: gatewayErrorMessage(checkError, t("app.tmuxCheckRequestFailed")),
        });
      } finally {
        updateRemoteState(hostId, { scanning: false });
      }
    }

    function openPanel(target: OpenTmuxPanelTarget = {}) {
      panelOpen.value = true;
      highlightedMonitorId.value = target.monitorId ?? null;
      useGatewayWorkspaceLayoutStore().requestPanelActivation(TMUX_WORKSPACE_PANEL_ID);
    }

    function closePanel() {
      panelOpen.value = false;
    }

    function removeHost(hostId: number) {
      remoteHosts.value = Object.fromEntries(
        Object.entries(remoteHosts.value).filter(([candidate]) => Number(candidate) !== hostId),
      );
      void loadSummary(true);
    }

    function handleCompletion(monitorId: number) {
      highlightedMonitorId.value = monitorId;
      void loadSummary(true);
    }

    function resetState() {
      sessionGeneration += 1;
      pendingSummary = null;
      pendingScans.clear();
      panelOpen.value = false;
      active.value = [];
      history.value = [];
      loading.value = false;
      error.value = "";
      loadedAt.value = 0;
      highlightedMonitorId.value = null;
      remoteHosts.value = {};
    }

    return {
      panelOpen,
      active,
      history,
      loading,
      error,
      highlightedMonitorId,
      remoteHosts,
      activeCount,
      oneShotActive,
      permanentActive,
      remoteStateFor,
      loadSummary,
      refreshSessions: scanSessions,
      addMonitor,
      promoteMonitor,
      cancelMonitor,
      checkNow,
      openPanel,
      closePanel,
      removeHost,
      handleCompletion,
      resetState,
    };
  },
  {
    persist: {
      pick: ["panelOpen"],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
);

function createRemoteState(): TmuxRemoteHostState {
  return { sessions: [], scanning: false, error: "" };
}
