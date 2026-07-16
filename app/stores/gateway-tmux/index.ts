import { defineStore } from "pinia";
import type { TmuxMonitorListResult, TmuxPaneSnapshot, TmuxSessionSnapshot } from "~~/shared/types";
import { gatewayErrorMessage } from "@/utils/gateway-error";
import {
  checkTmuxMonitors,
  createTmuxMonitor,
  deleteTmuxMonitor,
  fetchTmuxMonitors,
  fetchTmuxSessions,
} from "./transport";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { tmuxWorkspacePanelId } from "@/stores/gateway/workspace-panels";
import { currentTmuxThreadBinding } from "./monitor-context";

interface TmuxHostState extends TmuxMonitorListResult {
  sessions: TmuxSessionSnapshot[];
  loading: boolean;
  scanning: boolean;
  error: string;
  highlightedMonitorId: number | null;
  loadedAt: number;
}

export const useGatewayTmuxStore = defineStore(
  "gateway-tmux",
  () => {
    const { t } = useI18n();
    const openHostIds = ref<number[]>([]);
    const hosts = ref<Record<number, TmuxHostState>>({});
    const pendingSummaries = new Map<number, Promise<TmuxHostState>>();
    const pendingScans = new Map<number, Promise<TmuxHostState>>();

    function stateFor(hostId: number) {
      return (hosts.value[hostId] ??= createHostState());
    }

    async function loadHost(hostId: number, options: { scan?: boolean; force?: boolean } = {}) {
      const tasks = [loadSummary(hostId, options.force)];
      if (options.scan) tasks.push(scanSessions(hostId));
      await Promise.all(tasks);
      return stateFor(hostId);
    }

    async function loadSummary(hostId: number, force = false) {
      const state = stateFor(hostId);
      if (!force && state.loadedAt && Date.now() - state.loadedAt < 30_000) return state;
      const pending = pendingSummaries.get(hostId);
      if (pending) return await pending;
      const request = loadSummaryNow(hostId).finally(() => pendingSummaries.delete(hostId));
      pendingSummaries.set(hostId, request);
      return await request;
    }

    async function loadSummaryNow(hostId: number) {
      const state = stateFor(hostId);
      state.loading = true;
      state.error = "";
      try {
        const monitors = await fetchTmuxMonitors(hostId);
        state.active = monitors.active;
        state.history = monitors.history;
        state.loadedAt = Date.now();
      } catch (error) {
        state.error = gatewayErrorMessage(error, t("app.tmuxLoadFailed"));
      } finally {
        state.loading = false;
      }
      return state;
    }

    async function scanSessions(hostId: number) {
      const pending = pendingScans.get(hostId);
      if (pending) return await pending;
      const request = scanSessionsNow(hostId).finally(() => pendingScans.delete(hostId));
      pendingScans.set(hostId, request);
      return await request;
    }

    async function scanSessionsNow(hostId: number) {
      const state = stateFor(hostId);
      state.scanning = true;
      state.error = "";
      try {
        const result = await fetchTmuxSessions(hostId);
        state.sessions = result.sessions;
      } catch (error) {
        state.error = gatewayErrorMessage(error, t("app.tmuxScanFailed"));
      } finally {
        state.scanning = false;
      }
      return state;
    }

    async function addMonitor(hostId: number, pane: TmuxPaneSnapshot) {
      const monitor = await createTmuxMonitor(hostId, pane, currentTmuxThreadBinding(hostId));
      await loadHost(hostId, { force: true });
      return monitor;
    }

    async function cancelMonitor(hostId: number, monitorId: number) {
      await deleteTmuxMonitor(hostId, monitorId);
      await loadHost(hostId, { force: true });
    }

    async function checkNow(hostId: number) {
      const state = stateFor(hostId);
      state.scanning = true;
      state.error = "";
      try {
        const monitors = await checkTmuxMonitors(hostId);
        state.active = monitors.active;
        state.history = monitors.history;
        await scanSessions(hostId);
      } catch (error) {
        state.error = gatewayErrorMessage(error, t("app.tmuxCheckRequestFailed"));
      } finally {
        state.scanning = false;
      }
    }

    function openPanel(hostId: number, monitorId?: number) {
      if (!openHostIds.value.includes(hostId)) openHostIds.value = [...openHostIds.value, hostId];
      const state = stateFor(hostId);
      state.highlightedMonitorId = monitorId ?? null;
      useGatewayWorkspaceLayoutStore().requestPanelActivation(tmuxWorkspacePanelId(hostId));
    }

    function closePanel(hostId: number) {
      openHostIds.value = openHostIds.value.filter((candidate) => candidate !== hostId);
    }

    function handleCompletion(hostId: number, monitorId: number) {
      const state = stateFor(hostId);
      state.highlightedMonitorId = monitorId;
      void loadHost(hostId, { force: true });
    }

    function activeCount(hostId: number | null) {
      return hostId ? (hosts.value[hostId]?.active.length ?? 0) : 0;
    }

    return {
      openHostIds,
      hosts,
      stateFor,
      loadHost,
      refreshSessions: scanSessions,
      addMonitor,
      cancelMonitor,
      checkNow,
      openPanel,
      closePanel,
      handleCompletion,
      activeCount,
    };
  },
  {
    persist: {
      pick: ["openHostIds"],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
);

function createHostState(): TmuxHostState {
  return {
    active: [],
    history: [],
    sessions: [],
    loading: false,
    scanning: false,
    error: "",
    highlightedMonitorId: null,
    loadedAt: 0,
  };
}
