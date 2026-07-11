import type { ModelListResult, ProjectRecord, RemoteDirectoryEntry } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayStoreContext } from "../types";
import { writeGatewayRouteSelection } from "../route-state";
import { messageFromError } from "../thread-utils/identity";

export function createProjectActions(ctx: GatewayStoreContext) {
  let pendingModelRequest: { hostId: number; promise: Promise<void> } | null = null;

  async function loadModels(hostId: number) {
    ctx.state.loadingModels = true;
    const projectId = ctx.state.selectedProjectId;
    const threadId = ctx.state.selectedThreadId;
    try {
      const response = await gatewayApi<ModelListResult>("/api/models", {
        query: {
          hostId,
          includeHidden: false,
          limit: 50,
        },
      });
      if (ctx.state.selectedHostId !== hostId) {
        return;
      }
      ctx.state.models = response.data ?? [];
      ctx.state.modelsHostId = hostId;
    } catch (error: any) {
      ctx.setError(messageFromError(error, ctx.t("app.listModelsFailed"), ctx.errorLabels), {
        hostId,
        projectId,
        threadId,
      });
    } finally {
      if (ctx.state.selectedHostId === hostId) {
        ctx.state.loadingModels = false;
      }
    }
  }

  return {
    async selectProject(projectId: number) {
      ctx.cacheSelectedThreadView();
      ctx.beginViewTransition();
      ctx.state.selectedProjectId = projectId;
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.clearError();
      ctx.state.olderTurnsCursor = null;
      ctx.state.newerTurnsCursor = null;
      ctx.state.lastEventId = 0;
      writeGatewayRouteSelection({
        hostId: ctx.state.selectedHostId,
        projectId,
        threadId: null,
      });
      await ctx.listThreads();
    },

    async listRemoteDirectories(path = "~", hostId = ctx.state.selectedHostId) {
      if (!hostId) {
        return { path, entries: [] as RemoteDirectoryEntry[] };
      }

      return gatewayApi<{ path: string; entries: RemoteDirectoryEntry[] }>(
        "/api/remote/directories",
        {
          query: {
            hostId,
            path,
          },
        },
      );
    },

    async listModels() {
      if (!ctx.state.selectedHostId) {
        ctx.state.models = [];
        ctx.state.modelsHostId = null;
        return;
      }

      const hostId = ctx.state.selectedHostId;
      if (pendingModelRequest?.hostId === hostId) {
        return pendingModelRequest.promise;
      }

      const promise = loadModels(hostId).finally(() => {
        if (pendingModelRequest?.promise === promise) {
          pendingModelRequest = null;
        }
      });
      pendingModelRequest = { hostId, promise };
      return promise;
    },

    async ensureSelectedHostModels() {
      if (!ctx.state.selectedHostId || ctx.state.modelsHostId === ctx.state.selectedHostId) {
        return;
      }
      await ctx.listModels();
    },

    async createProject(input: Record<string, unknown>) {
      const project = await gatewayApi<ProjectRecord>("/api/projects", {
        method: "POST",
        body: input,
      });
      const index = ctx.state.projects.findIndex((item) => item.id === project.id);
      if (index >= 0) {
        ctx.state.projects[index] = project;
      } else {
        ctx.state.projects.push(project);
      }
      upsertConfiguredProject(ctx, project);
      ctx.persistConfig();
      ctx.cacheSelectedThreadView();
      ctx.beginViewTransition();
      ctx.state.selectedHostId = project.hostId;
      ctx.state.selectedProjectId = project.id;
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.clearError();
      writeGatewayRouteSelection({
        hostId: project.hostId,
        projectId: project.id,
        threadId: null,
      });
      await ctx.listThreads();
      return project;
    },

    async updateProject(projectId: number, input: Record<string, unknown>) {
      const project = await gatewayApi<ProjectRecord>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: input,
      });
      ctx.state.projects = ctx.state.projects.map((item) =>
        item.id === projectId ? project : item,
      );
      upsertConfiguredProject(ctx, project);
      const { [projectId]: _removed, ...remainingAvailability } =
        ctx.state.projectDirectoryAvailability;
      ctx.state.projectDirectoryAvailability = remainingAvailability;
      if (ctx.state.selectedProjectId !== projectId) {
        await ctx.refreshHostProjects(project.hostId);
        return project;
      }

      ctx.cacheSelectedThreadView();
      ctx.beginViewTransition();
      ctx.state.selectedHostId = project.hostId;
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.clearError();
      ctx.state.olderTurnsCursor = null;
      ctx.state.newerTurnsCursor = null;
      ctx.state.lastEventId = 0;
      writeGatewayRouteSelection({
        hostId: project.hostId,
        projectId: project.id,
        threadId: null,
      });
      await ctx.listThreads();
      return project;
    },

    async deleteProject(projectId: number) {
      const project = ctx.state.projects.find((item) => item.id === projectId);
      await gatewayApi(`/api/projects/${projectId}`, { method: "DELETE" });
      ctx.state.projects = ctx.state.projects.filter((item) => item.id !== projectId);
      const { [projectId]: _removed, ...remainingAvailability } =
        ctx.state.projectDirectoryAvailability;
      ctx.state.projectDirectoryAvailability = remainingAvailability;
      ctx.state.gatewayConfig.projects = ctx.state.gatewayConfig.projects.filter(
        (item) => item.id !== projectId,
      );

      if (ctx.state.selectedProjectId !== projectId) {
        return;
      }

      const nextProject =
        ctx.state.projects.find((item) => item.hostId === project?.hostId) ??
        ctx.state.projects.find((item) => item.hostId === ctx.state.selectedHostId) ??
        null;

      ctx.cacheSelectedThreadView();
      ctx.beginViewTransition();
      ctx.state.selectedHostId = project?.hostId ?? ctx.state.selectedHostId;
      ctx.state.selectedProjectId = nextProject?.id ?? null;
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.clearError();
      ctx.state.olderTurnsCursor = null;
      ctx.state.newerTurnsCursor = null;
      ctx.state.lastEventId = 0;
      writeGatewayRouteSelection({
        hostId: ctx.state.selectedHostId,
        projectId: ctx.state.selectedProjectId,
        threadId: null,
      });
      await ctx.listThreads();
    },

    mergeProjects(projects: ProjectRecord[]) {
      for (const project of projects) {
        const index = ctx.state.projects.findIndex((item) => item.id === project.id);
        if (index >= 0) {
          ctx.state.projects[index] = project;
        } else {
          ctx.state.projects.push(project);
        }
      }
    },

    ensureSelectedProject() {
      if (!ctx.state.selectedHostId || ctx.state.selectedProjectId) {
        return;
      }
      ctx.state.selectedProjectId =
        ctx.state.projects.find((project) => project.hostId === ctx.state.selectedHostId)?.id ??
        null;
    },
  };
}

function upsertConfiguredProject(ctx: GatewayStoreContext, project: ProjectRecord) {
  const index = ctx.state.gatewayConfig.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    ctx.state.gatewayConfig.projects[index] = project;
  } else {
    ctx.state.gatewayConfig.projects.push(project);
  }
}
