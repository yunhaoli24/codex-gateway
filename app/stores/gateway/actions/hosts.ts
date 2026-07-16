import type { HostRecord } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { writeGatewayRouteSelection } from "../route-state";
import { beginViewTransition, cacheSelectedThreadView } from "../thread-open/view-state";

export function createHostActions() {
  function selectHostState(hostId: number | null) {
    const gateway = useGatewayStore();
    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    beginViewTransition();
    navigation.selectedHostId = hostId;
    navigation.selectedProjectId = null;
    navigation.selectedThreadId = null;
    navigation.threads = [];
    views.resetCurrentView();
    gateway.models = [];
    gateway.modelsHostId = null;
    gateway.clearError();
  }

  return {
    async createHost(input: Record<string, unknown>) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const host = await gatewayApi<HostRecord>("/api/hosts", { method: "POST", body: input });
      gateway.hosts.push(host);
      gateway.persistConfig();
      selectHostState(host.id);
      writeGatewayRouteSelection({ hostId: host.id, projectId: null, threadId: null });
      await Promise.all([gateway.listModels(), navigation.listThreads()]);
      gateway.ensureSelectedProject();
      if (navigation.selectedProjectId) await navigation.listThreads();
      return host;
    },

    async updateHost(hostId: number, input: Record<string, unknown>) {
      const gateway = useGatewayStore();
      const host = await gatewayApi<HostRecord>(`/api/hosts/${hostId}`, {
        method: "PATCH",
        body: input,
      });
      gateway.hosts = gateway.hosts.map((candidate) =>
        candidate.id === hostId ? host : candidate,
      );
      gateway.persistConfig();
      return host;
    },

    async deleteHost(hostId: number) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      await gatewayApi(`/api/hosts/${hostId}`, { method: "DELETE" });
      useGatewayRealtimeStore().closeHostThreadEvents(hostId);
      useGatewayTmuxStore().closePanel(hostId);
      gateway.hosts = gateway.hosts.filter((host) => host.id !== hostId);
      const removedProjectIds = new Set(
        gateway.projects
          .filter((project) => project.hostId === hostId)
          .map((project) => project.id),
      );
      gateway.projects = gateway.projects.filter((project) => project.hostId !== hostId);
      gateway.projectDirectoryAvailability = Object.fromEntries(
        Object.entries(gateway.projectDirectoryAvailability).filter(
          ([projectId]) => !removedProjectIds.has(Number(projectId)),
        ),
      );
      gateway.gatewayConfig.projects = gateway.gatewayConfig.projects.filter(
        (project) => project.hostId !== hostId,
      );
      gateway.hostConnectionStatuses = omitKey(gateway.hostConnectionStatuses, hostId);
      gateway.gatewayConfig.pinnedThreads = gateway.gatewayConfig.pinnedThreads.filter(
        (thread) => thread.hostId !== hostId,
      );
      gateway.persistConfig();
      if (navigation.selectedHostId === hostId) {
        selectHostState(gateway.hosts[0]?.id ?? null);
        writeGatewayRouteSelection(
          { hostId: navigation.selectedHostId, projectId: null, threadId: null },
          { replace: true },
        );
        if (navigation.selectedHostId) {
          await gateway.listModels();
          await navigation.listThreads();
        }
      }
    },

    async selectHost(hostId: number) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      cacheSelectedThreadView();
      selectHostState(hostId);
      writeGatewayRouteSelection({ hostId, projectId: null, threadId: null });
      await gateway.listModels();
      await navigation.listThreads();
      gateway.ensureSelectedProject();
      if (navigation.selectedProjectId) await navigation.listThreads();
    },
  };
}

function omitKey<T>(record: Record<number, T>, key: number) {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}
