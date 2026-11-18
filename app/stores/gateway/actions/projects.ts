import type {
  ModelListResult,
  ModelRecord,
  ProjectCreateInput,
  ProjectRecord,
  RemoteDirectoryEntry,
} from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { writeGatewayRouteSelection } from "../route-state";
import { cacheSelectedThreadView, beginViewTransition } from "../thread-open/view-state";
import { messageFromError } from "../thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";

export function createProjectActions() {
  let modelRequestRevision = 0;
  let pendingModelRequest: {
    hostId: number;
    modelProvider: string | null;
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

  function selectedModelProvider() {
    const navigation = useGatewayNavigationStore();
    const thread = useGatewayThreadViewStore().currentThread;
    return thread?.hostId === navigation.selectedHostId &&
      thread?.id === navigation.selectedThreadId
      ? (thread?.modelProvider ?? null)
      : null;
  }

  async function loadModels(hostId: number, modelProvider: string | null) {
    const revision = ++modelRequestRevision;
    const sessionIsCurrent = captureSessionEpoch();
    const catalog = useGatewayCatalogStore();
    const bootstrap = useGatewayBootstrapStore();
    const navigation = useGatewayNavigationStore();
    catalog.loadingModels = true;
    // A cleared catalog is not a cache hit for its previous provider. Invalidate its identity
    // together with its data so A -> B -> A navigation starts the required A request.
    catalog.models = [];
    catalog.modelsHostId = null;
    catalog.modelsProvider = null;
    const cwd = navigation.selectedCwd;
    const threadId = navigation.selectedThreadId;
    const isCurrentRequest = () =>
      sessionIsCurrent() &&
      revision === modelRequestRevision &&
      navigation.selectedHostId === hostId &&
      selectedModelProvider() === modelProvider;
    try {
      const models: ModelRecord[] = [];
      let cursor: string | null = null;
      // Custom providers can expose more than one catalog page. Follow only official cursors,
      // sequentially, and stop as soon as navigation supersedes this provider's request.
      do {
        const response: ModelListResult = await gatewayApi<ModelListResult>("/api/models", {
          query: {
            hostId,
            modelProvider: modelProvider ?? undefined,
            includeHidden: false,
            limit: 50,
            cursor: cursor ?? undefined,
          },
        });
        if (!isCurrentRequest()) return;
        models.push(...response.data);
        cursor = response.nextCursor ?? null;
      } while (cursor !== null);
      catalog.models = models;
      catalog.modelsHostId = hostId;
      catalog.modelsProvider = modelProvider;
    } catch (error: unknown) {
      if (!isCurrentRequest()) return;
      bootstrap.setError(
        messageFromError(error, bootstrap.t("app.listModelsFailed"), bootstrap.errorLabels),
        { hostId, cwd, threadId },
      );
    } finally {
      if (sessionIsCurrent() && revision === modelRequestRevision) catalog.loadingModels = false;
    }
  }

  return {
    async selectProject(cwd: string) {
      const navigation = useGatewayNavigationStore();
      clearThreadSelection();
      navigation.selectedCwd = cwd;
      writeGatewayRouteSelection({ hostId: navigation.selectedHostId, cwd, threadId: null });
      await Promise.all([
        navigation.listThreads(),
        useGatewayCatalogStore().ensureSelectedHostModels(),
      ]);
    },

    async listRemoteDirectories(path = "~", hostId = useGatewayNavigationStore().selectedHostId) {
      if (hostId === null) return { path, entries: [] as RemoteDirectoryEntry[] };
      return gatewayApi<{ path: string; entries: RemoteDirectoryEntry[] }>(
        "/api/remote/directories",
        { query: { hostId, path } },
      );
    },

    async listModels(options: { force?: boolean } = {}) {
      const catalog = useGatewayCatalogStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      const modelProvider = selectedModelProvider();
      if (hostId === null) {
        modelRequestRevision += 1;
        catalog.models = [];
        catalog.modelsHostId = null;
        catalog.modelsProvider = null;
        catalog.loadingModels = false;
        return;
      }
      if (
        options.force !== true &&
        pendingModelRequest?.hostId === hostId &&
        pendingModelRequest.modelProvider === modelProvider &&
        pendingModelRequest.sessionIsCurrent()
      )
        return pendingModelRequest.promise;
      const sessionIsCurrent = captureSessionEpoch();
      const promise = loadModels(hostId, modelProvider).finally(() => {
        if (pendingModelRequest?.promise === promise) pendingModelRequest = null;
      });
      pendingModelRequest = { hostId, modelProvider, promise, sessionIsCurrent };
      return promise;
    },

    async ensureSelectedHostModels() {
      const catalog = useGatewayCatalogStore();
      const hostId = useGatewayNavigationStore().selectedHostId;
      if (
        hostId === null ||
        (catalog.modelsHostId === hostId && catalog.modelsProvider === selectedModelProvider())
      )
        return;
      // A resumed thread is bound to its saved provider; a changed host default must not leak
      // another provider's catalog into its picker. Keep one active catalog, not an unbounded cache.
      catalog.models = [];
      await catalog.listModels();
    },

    async createProject(input: ProjectCreateInput) {
      const sessionIsCurrent = captureSessionEpoch();
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      const project = await gatewayApi<ProjectRecord>("/api/projects", {
        method: "POST",
        body: input,
      });
      if (!sessionIsCurrent()) return project;
      catalog.mergeProjects([project]);
      clearThreadSelection();
      navigation.selectedHostId = project.hostId;
      navigation.selectedCwd = project.remotePath;
      writeGatewayRouteSelection({
        hostId: project.hostId,
        cwd: project.remotePath,
        threadId: null,
      });
      // Creating a project explicitly navigates to it, including when its host was registered
      // without being selected. Load that host's models here instead of relying on host creation
      // to have navigated and populated the composer as an unrelated side effect.
      await Promise.all([catalog.listModels(), navigation.listThreads()]);
      return project;
    },

    mergeProjects(projects: ProjectRecord[]) {
      const catalog = useGatewayCatalogStore();
      for (const project of projects) {
        const index = catalog.projects.findIndex(
          (item) => item.hostId === project.hostId && item.remotePath === project.remotePath,
        );
        if (index >= 0) catalog.projects[index] = project;
        else catalog.projects.push(project);
      }
    },

    ensureSelectedProject() {
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      if (navigation.selectedHostId === null || navigation.selectedCwd !== null) return;
      navigation.selectedCwd =
        catalog.projects.find((project) => project.hostId === navigation.selectedHostId)
          ?.remotePath ?? null;
    },
  };
}
