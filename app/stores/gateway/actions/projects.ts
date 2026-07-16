import type { ModelListResult, ProjectRecord, RemoteDirectoryEntry } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { writeGatewayRouteSelection } from "../route-state";
import { cacheSelectedThreadView, beginViewTransition } from "../thread-open/view-state";
import { messageFromError } from "../thread-utils/identity";

export function createProjectActions() {
  let pendingModelRequest: { hostId: number; promise: Promise<void> } | null = null;

  function clearThreadSelection() {
    const navigation = useGatewayNavigationStore();
    cacheSelectedThreadView();
    beginViewTransition();
    navigation.selectedThreadId = null;
    useGatewayThreadViewStore().resetCurrentView();
    useGatewayStore().clearError();
  }

  async function loadModels(hostId: number) {
    const gateway = useGatewayStore();
    const navigation = useGatewayNavigationStore();
    gateway.loadingModels = true;
    const projectId = navigation.selectedProjectId;
    const threadId = navigation.selectedThreadId;
    try {
      const response = await gatewayApi<ModelListResult>("/api/models", {
        query: { hostId, includeHidden: false, limit: 50 },
      });
      if (navigation.selectedHostId !== hostId) return;
      gateway.models = response.data ?? [];
      gateway.modelsHostId = hostId;
    } catch (error: any) {
      gateway.setError(
        messageFromError(error, gateway.t("app.listModelsFailed"), gateway.errorLabels),
        { hostId, projectId, threadId },
      );
    } finally {
      if (navigation.selectedHostId === hostId) gateway.loadingModels = false;
    }
  }

  return {
    async selectProject(projectId: number) {
      const navigation = useGatewayNavigationStore();
      clearThreadSelection();
      navigation.selectedProjectId = projectId;
      writeGatewayRouteSelection({ hostId: navigation.selectedHostId, projectId, threadId: null });
      await navigation.listThreads();
    },

    async listRemoteDirectories(path = "~", hostId = useGatewayNavigationStore().selectedHostId) {
      if (!hostId) return { path, entries: [] as RemoteDirectoryEntry[] };
      return gatewayApi<{ path: string; entries: RemoteDirectoryEntry[] }>(
        "/api/remote/directories",
        { query: { hostId, path } },
      );
    },

    async listModels() {
      const gateway = useGatewayStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      if (!hostId) {
        gateway.models = [];
        gateway.modelsHostId = null;
        return;
      }
      if (pendingModelRequest?.hostId === hostId) return pendingModelRequest.promise;
      const promise = loadModels(hostId).finally(() => {
        if (pendingModelRequest?.promise === promise) pendingModelRequest = null;
      });
      pendingModelRequest = { hostId, promise };
      return promise;
    },

    async ensureSelectedHostModels() {
      const gateway = useGatewayStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      if (!hostId || gateway.modelsHostId === hostId) return;
      await gateway.listModels();
    },

    async createProject(input: Record<string, unknown>) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const project = await gatewayApi<ProjectRecord>("/api/projects", {
        method: "POST",
        body: input,
      });
      gateway.mergeProjects([project]);
      upsertConfiguredProject(project);
      gateway.persistConfig();
      clearThreadSelection();
      navigation.selectedHostId = project.hostId;
      navigation.selectedProjectId = project.id;
      writeGatewayRouteSelection({ hostId: project.hostId, projectId: project.id, threadId: null });
      await navigation.listThreads();
      return project;
    },

    async updateProject(projectId: number, input: Record<string, unknown>) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const project = await gatewayApi<ProjectRecord>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: input,
      });
      gateway.projects = gateway.projects.map((item) => (item.id === projectId ? project : item));
      upsertConfiguredProject(project);
      gateway.projectDirectoryAvailability = omitKey(
        gateway.projectDirectoryAvailability,
        projectId,
      );
      if (navigation.selectedProjectId !== projectId) {
        await navigation.refreshHostProjects(project.hostId);
        return project;
      }
      clearThreadSelection();
      navigation.selectedHostId = project.hostId;
      writeGatewayRouteSelection({ hostId: project.hostId, projectId, threadId: null });
      await navigation.listThreads();
      return project;
    },

    async deleteProject(projectId: number) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const project = gateway.projects.find((item) => item.id === projectId);
      await gatewayApi(`/api/projects/${projectId}`, { method: "DELETE" });
      gateway.projects = gateway.projects.filter((item) => item.id !== projectId);
      gateway.projectDirectoryAvailability = omitKey(
        gateway.projectDirectoryAvailability,
        projectId,
      );
      gateway.gatewayConfig.projects = gateway.gatewayConfig.projects.filter(
        (item) => item.id !== projectId,
      );
      if (navigation.selectedProjectId !== projectId) return;
      const nextProject =
        gateway.projects.find((item) => item.hostId === project?.hostId) ??
        gateway.projects.find((item) => item.hostId === navigation.selectedHostId) ??
        null;
      clearThreadSelection();
      navigation.selectedHostId = project?.hostId ?? navigation.selectedHostId;
      navigation.selectedProjectId = nextProject?.id ?? null;
      writeGatewayRouteSelection({
        hostId: navigation.selectedHostId,
        projectId: navigation.selectedProjectId,
        threadId: null,
      });
      await navigation.listThreads();
    },

    mergeProjects(projects: ProjectRecord[]) {
      const gateway = useGatewayStore();
      for (const project of projects) {
        const index = gateway.projects.findIndex((item) => item.id === project.id);
        if (index >= 0) gateway.projects[index] = project;
        else gateway.projects.push(project);
      }
    },

    ensureSelectedProject() {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || navigation.selectedProjectId) return;
      navigation.selectedProjectId =
        gateway.projects.find((project) => project.hostId === navigation.selectedHostId)?.id ??
        null;
    },
  };
}

function upsertConfiguredProject(project: ProjectRecord) {
  const gateway = useGatewayStore();
  const index = gateway.gatewayConfig.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) gateway.gatewayConfig.projects[index] = project;
  else gateway.gatewayConfig.projects.push(project);
}

function omitKey<T>(record: Record<number, T>, key: number) {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}
