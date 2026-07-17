import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import type { TmuxMonitor, TmuxMonitorThreadBinding } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";

export interface TmuxThreadOption extends TmuxMonitorThreadBinding {
  updatedAt: number;
}

export function useTmuxMonitorDashboard() {
  const gateway = useGatewayStore();
  const activity = useGatewayThreadActivityStore();
  const tmux = useGatewayTmuxStore();
  const { hosts } = storeToRefs(gateway);
  const { summariesByKey } = storeToRefs(activity);
  const { active, history, panelOpen, selectedHostId, selectedThreadId } = storeToRefs(tmux);

  const hostNames = computed(() =>
    Object.fromEntries(hosts.value.map((host) => [host.id, host.name || host.sshHost])),
  );
  const threadOptions = computed(() => {
    if (!selectedHostId.value) return [];
    const byId = new Map<string, TmuxThreadOption>();
    for (const summary of Object.values(summariesByKey.value)) {
      if (summary.hostId !== selectedHostId.value) continue;
      byId.set(summary.threadId, {
        projectId: summary.projectId,
        threadId: summary.threadId,
        threadTitle: summary.title,
        updatedAt: summary.updatedAt,
      });
    }
    // Monitor rows retain their thread snapshot even when it is outside the current
    // app-server list page, so the dashboard must still offer it as a filter target.
    for (const monitor of [...active.value, ...history.value]) {
      if (monitor.hostId !== selectedHostId.value || !monitor.threadId) continue;
      if (!byId.has(monitor.threadId)) {
        byId.set(monitor.threadId, {
          projectId: monitor.projectId,
          threadId: monitor.threadId,
          threadTitle: monitor.threadTitle || monitor.threadId,
          updatedAt: Date.parse(monitor.completedAt || monitor.createdAt) / 1000,
        });
      }
    }
    return [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  });
  const selectedThreadBinding = computed<TmuxMonitorThreadBinding | null>(() => {
    if (!selectedThreadId.value) return null;
    const thread = threadOptions.value.find(
      (candidate) => candidate.threadId === selectedThreadId.value,
    );
    return thread
      ? {
          projectId: thread.projectId,
          threadId: thread.threadId,
          threadTitle: thread.threadTitle,
        }
      : null;
  });
  const filteredActive = computed(() => filterMonitors(active.value));
  const filteredHistory = computed(() => filterMonitors(history.value));
  const selectedHostActiveCount = computed(
    () => active.value.filter((monitor) => monitor.hostId === selectedHostId.value).length,
  );

  function filterMonitors(monitors: TmuxMonitor[]) {
    return monitors.filter((monitor) => {
      if (selectedHostId.value && monitor.hostId !== selectedHostId.value) return false;
      if (selectedThreadId.value && monitor.threadId !== selectedThreadId.value) return false;
      return true;
    });
  }

  watch(
    selectedHostId,
    (hostId) => {
      if (hostId) void tmux.refreshSessions(hostId);
    },
    { immediate: true },
  );
  watch(
    [panelOpen, hosts],
    ([open, availableHosts]) => {
      if (!open) return;
      if (
        selectedHostId.value &&
        !availableHosts.some((host) => host.id === selectedHostId.value)
      ) {
        tmux.selectHost(null);
      }
    },
    { immediate: true },
  );

  return {
    hosts,
    hostNames,
    threadOptions,
    selectedThreadBinding,
    filteredActive,
    filteredHistory,
    selectedHostActiveCount,
  };
}
