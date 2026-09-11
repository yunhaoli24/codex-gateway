import type { ModelListResult, ProjectRecord, RemoteDirectoryEntry } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayConfigStore } from "@/stores/gateway-config";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { writeGatewayRouteSelection } from "../route-state";
import { cacheSelectedThreadView, beginViewTransition } from "../thread-open/view-state";
import { messageFromError } from "../thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { useGatewayProjectDefaultsStore } from "@/stores/gateway-project-defaults";

export function createProjectActions() {
  let pendingModelRequest: {
    hostId: number;
    promise: Promise<void>;
    sessionIsCurrent: () => boolean;
  } | null = null;

  function clearThreadSelection() {
    const navigation = useGatewayNavigationStore();
    cacheSelectedThreadView();
    beginViewTransition();
    navigation.selectedThreadId = null;
    useGatewayThreadViewStore().resetCurrentView();
    useGatewayBootstrapStore().clearError();
  }

  async function loadModels(hostId: number) {
    const sessionIsCurrent = captureSessionEpoch();
    const catalog = useGatewayCatalogStore();
    const bootstrap = useGatewayBootstrapStore();
    const navigation = useGatewayNavigationStore();
    catalog.loadingModels = true;
    const projectId = navigation.selectedProjectId;
    const threadId = navigation.selectedThreadId;
    try {
      const response = await gatewayApi<ModelListResult>("/api/models", {
        query: { hostId, includeHidden: false, limit: 50 },
      });
      if (!sessionIsCurrent() || navigation.selectedHostId !== hostId) return;
      catalog.models = response.data ?? [];
      catalog.modelsHostId = hostId;
    } catch (error: unknown) {
      if (!sessionIsCurrent()) return;
      bootstrap.setError(
        messageFromError(error, bootstrap.t("app.listModelsFailed"), bootstrap.errorLabels),
        { hostId, projectId, threadId },
      );
    } finally {
      if (sessionIsCurrent() && navigation.selectedHostId === hostId) catalog.loadingModels = false;
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
      if (hostId === null) return { path, entries: [] as RemoteDirectoryEntry[] };
      return gatewayApi<{ path: string; entries: RemoteDirectoryEntry[] }>(
        "/api/remote/directories",
        { query: { hostId, path } },
      );
    },

    async listModels() {
      const catalog = useGatewayCatalogStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      if (hostId === null) {
        catalog.models = [];
        catalog.modelsHostId = null;
        return;
      }
      if (pendingModelRequest?.hostId === hostId && pendingModelRequest.sessionIsCurrent())
        return pendingModelRequest.promise;
      const sessionIsCurrent = captureSessionEpoch();
      const promise = loadModels(hostId).finally(() => {
        if (pendingModelRequest?.promise === promise) pendingModelRequest = null;
      });
      pendingModelRequest = { hostId, promise, sessionIsCurrent };
      return promise;
    },

    async ensureSelectedHostModels() {
      const catalog = useGatewayCatalogStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      if (hostId === null || catalog.modelsHostId === hostId) return;
      await catalog.listModels();
    },

    async createProject(input: Record<string, unknown>) {
      const sessionIsCurrent = captureSessionEpoch();
      const catalog = useGatewayCatalogStore();
      const config = useGatewayConfigStore();
      const navigation = useGatewayNavigationStore();
      const project = await gatewayApi<ProjectRecord>("/api/projects", {
        method: "POST",
        body: input,
      });
      if (!sessionIsCurrent()) return project;
      catalog.mergeProjects([project]);
      upsertConfiguredProject(project);
      config.setCatalog(catalog.hosts, catalog.projects);
      clearThreadSelection();
      navigation.selectedHostId = project.hostId;
      navigation.selectedProjectId = project.id;
      writeGatewayRouteSelection({ hostId: project.hostId, projectId: project.id, threadId: null });
      await navigation.listThreads();
      return project;
    },

    async updateProject(projectId: number, input: Record<string, unknown>) {
      const sessionIsCurrent = captureSessionEpoch();
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      const project = await gatewayApi<ProjectRecord>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: input,
      });
      if (!sessionIsCurrent()) return project;
      catalog.projects = catalog.projects.map((item) => (item.id === projectId ? project : item));
      upsertConfiguredProject(project);
      catalog.projectDirectoryAvailability = omitKey(
        catalog.projectDirectoryAvailability,
        projectId,
      );
      useGatewayProjectDefaultsStore().clearProject(project.hostId, projectId);
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
      const sessionIsCurrent = captureSessionEpoch();
      const catalog = useGatewayCatalogStore();
      const config = useGatewayConfigStore();
      const navigation = useGatewayNavigationStore();
      const project = catalog.projects.find((item) => item.id === projectId);
      await gatewayApi(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!sessionIsCurrent()) return;
      catalog.projects = catalog.projects.filter((item) => item.id !== projectId);
      catalog.projectDirectoryAvailability = omitKey(
        catalog.projectDirectoryAvailability,
        projectId,
      );
      config.gatewayConfig.projects = config.gatewayConfig.projects.filter(
        (item) => item.id !== projectId,
      );
      if (project !== undefined) {
        useGatewayProjectDefaultsStore().clearProject(project.hostId, projectId);
      }
      if (navigation.selectedProjectId !== projectId) return;
      const nextProject =
        catalog.projects.find((item) => item.hostId === project?.hostId) ??
        catalog.projects.find((item) => item.hostId === navigation.selectedHostId) ??
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
      const catalog = useGatewayCatalogStore();
      for (const project of projects) {
        const index = catalog.projects.findIndex((item) => item.id === project.id);
        if (index >= 0) catalog.projects[index] = project;
        else catalog.projects.push(project);
      }
    },

    ensureSelectedProject() {
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      if (navigation.selectedHostId === null || navigation.selectedProjectId !== null) return;
      navigation.selectedProjectId =
        catalog.projects.find((project) => project.hostId === navigation.selectedHostId)?.id ??
        null;
    },
  };
}

function upsertConfiguredProject(project: ProjectRecord) {
  const config = useGatewayConfigStore();
  const index = config.gatewayConfig.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) config.gatewayConfig.projects[index] = project;
  else config.gatewayConfig.projects.push(project);
}

function omitKey<T>(record: Record<number, T>, key: number) {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}
