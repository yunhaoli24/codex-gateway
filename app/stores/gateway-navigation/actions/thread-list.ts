import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import type { ThreadListResponse } from "@/stores/gateway/types";
import { messageFromError, pinnedKey, sortThreads } from "@/stores/gateway/thread-utils/identity";
import { runtimeStatusFromAppThreadStatus } from "@/stores/gateway/thread-utils/status";

export function createThreadListActions() {
  async function loadHostOverview(hostId: number) {
    const gateway = useGatewayStore();
    const response = await gatewayApi<ThreadListResponse>("/api/threads", {
      query: { hostId, limit: 50 },
    });
    if (response.projects) gateway.mergeProjects(response.projects);
    applyProjectDirectoryAvailability(response);
    useGatewayThreadActivityStore().ingestThreads(hostId, response.data ?? [], gateway.projects);
    syncThreadStatusesFromList(hostId, response.data ?? []);
  }

  function decorateThreads(threads: any[]) {
    const gateway = useGatewayStore();
    const navigation = useGatewayNavigationStore();
    const pinned = new Set(
      gateway.gatewayConfig.pinnedThreads.map((thread) =>
        pinnedKey(thread.hostId, thread.threadId),
      ),
    );
    return threads.map((thread) => ({
      ...thread,
      pinned: navigation.selectedHostId
        ? pinned.has(pinnedKey(navigation.selectedHostId, String(thread.id)))
        : false,
    }));
  }

  return {
    async connectAllHosts() {
      const gateway = useGatewayStore();
      await Promise.all(
        gateway.hosts.map(async (host) => {
          gateway.setHostConnectionStatus(host.id, "connecting");
          try {
            await loadHostOverview(host.id);
            gateway.setHostConnectionStatus(host.id, "connected");
          } catch (error: any) {
            gateway.setHostConnectionStatus(
              host.id,
              "failed",
              messageFromError(error, gateway.t("app.connectHostFailed"), gateway.errorLabels),
            );
          }
        }),
      );
      gateway.persistConfig();
    },
    refreshHostProjects: loadHostOverview,
    async listThreads(searchTerm = "") {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const hostId = navigation.selectedHostId;
      const projectId = navigation.selectedProjectId;
      const projectCwd = gateway.selectedProject?.remotePath;
      if (!hostId) return;
      views.loading = true;
      gateway.clearError();
      try {
        const query: Record<string, unknown> = { hostId, limit: 50 };
        if (projectId) query.projectId = projectId;
        if (projectCwd) query.cwd = projectCwd;
        if (searchTerm) query.searchTerm = searchTerm;
        const response = await gatewayApi<ThreadListResponse>("/api/threads", { query });
        if (navigation.selectedHostId !== hostId || navigation.selectedProjectId !== projectId)
          return;
        if (response.projects) gateway.mergeProjects(response.projects);
        applyProjectDirectoryAvailability(response);
        useGatewayThreadActivityStore().ingestThreads(
          hostId,
          response.data ?? [],
          gateway.projects,
        );
        gateway.setHostConnectionStatus(hostId, "connected");
        syncThreadStatusesFromList(hostId, response.data ?? []);
        navigation.threads = sortThreads(decorateThreads(response.data ?? []));
        gateway.persistConfig();
      } catch (error: any) {
        if (navigation.selectedHostId !== hostId || navigation.selectedProjectId !== projectId)
          return;
        const message = messageFromError(
          error,
          gateway.t("app.listThreadsFailed"),
          gateway.errorLabels,
        );
        gateway.setHostConnectionStatus(hostId, "failed", message);
        gateway.setError(message, { hostId, projectId, threadId: navigation.selectedThreadId });
      } finally {
        if (navigation.selectedHostId === hostId && navigation.selectedProjectId === projectId) {
          views.loading = false;
        }
      }
    },
    decorateThreads,
  };
}

function applyProjectDirectoryAvailability(response: ThreadListResponse) {
  if (!response.projectDirectoryAvailability) return;
  const gateway = useGatewayStore();
  gateway.projectDirectoryAvailability = {
    ...gateway.projectDirectoryAvailability,
    ...response.projectDirectoryAvailability,
  };
}

function syncThreadStatusesFromList(hostId: number, threads: any[]) {
  const runtime = useGatewayThreadRuntimeStore();
  for (const thread of threads) {
    if (!thread?.id || !thread.status) continue;
    runtime.setThreadStatus(
      hostId,
      String(thread.id),
      runtimeStatusFromAppThreadStatus(thread.status),
    );
  }
}
