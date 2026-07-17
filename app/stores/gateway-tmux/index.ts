import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  TmuxMonitor,
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
} from "./transport";

interface TmuxRemoteHostState {
  sessions: TmuxSessionSnapshot[];
  scanning: boolean;
  error: string;
}

interface OpenTmuxPanelTarget {
  hostId?: number | null;
  threadId?: string | null;
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
    const selectedHostId = ref<number | null>(null);
    const selectedThreadId = ref<string | null>(null);
    const highlightedMonitorId = ref<number | null>(null);
    const remoteHosts = ref<Record<number, TmuxRemoteHostState>>({});
    const pendingScans = new Map<number, Promise<TmuxRemoteHostState>>();
    let pendingSummary: Promise<void> | null = null;
    let sessionGeneration = 0;

    const activeCount = computed(() => active.value.length);

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
      const request = scanSessionsNow(hostId);
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
    ) {
      const monitor = await createTmuxMonitor(hostId, pane, thread);
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

    function selectHost(hostId: number | null) {
      selectedHostId.value = hostId;
      selectedThreadId.value = null;
      highlightedMonitorId.value = null;
    }

    function selectThread(threadId: string | null) {
      selectedThreadId.value = threadId;
      highlightedMonitorId.value = null;
    }

    function openPanel(target: OpenTmuxPanelTarget = {}) {
      panelOpen.value = true;
      if ("hostId" in target) selectedHostId.value = target.hostId ?? null;
      if ("threadId" in target) selectedThreadId.value = target.threadId ?? null;
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
      if (selectedHostId.value === hostId) selectHost(null);
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
      selectedHostId.value = null;
      selectedThreadId.value = null;
      highlightedMonitorId.value = null;
      remoteHosts.value = {};
    }

    return {
      panelOpen,
      active,
      history,
      loading,
      error,
      selectedHostId,
      selectedThreadId,
      highlightedMonitorId,
      remoteHosts,
      activeCount,
      remoteStateFor,
      loadSummary,
      refreshSessions: scanSessions,
      addMonitor,
      cancelMonitor,
      checkNow,
      selectHost,
      selectThread,
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
