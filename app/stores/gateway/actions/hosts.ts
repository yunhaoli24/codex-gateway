import type { HostRecord } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import type { GatewayStoreContext } from "../types";
import { writeGatewayRouteSelection } from "../route-state";

export function createHostActions(ctx: GatewayStoreContext) {
  return {
    async createHost(input: Record<string, unknown>) {
      const host = await gatewayApi<HostRecord>("/api/hosts", { method: "POST", body: input });
      ctx.state.hosts.push(host);
      ctx.persistConfig();
      ctx.beginViewTransition();
      ctx.state.selectedHostId = host.id;
      ctx.state.selectedProjectId = null;
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.state.models = [];
      ctx.state.modelsHostId = null;
      ctx.clearError();
      writeGatewayRouteSelection({ hostId: host.id, projectId: null, threadId: null });
      await Promise.all([ctx.listModels(), ctx.listThreads()]);
      ctx.ensureSelectedProject();
      if (ctx.state.selectedProjectId) {
        await ctx.listThreads();
      }
      return host;
    },

    async updateHost(hostId: number, input: Record<string, unknown>) {
      const host = await gatewayApi<HostRecord>(`/api/hosts/${hostId}`, {
        method: "PATCH",
        body: input,
      });
      ctx.state.hosts = ctx.state.hosts.map((candidate) =>
        candidate.id === hostId ? host : candidate,
      );
      ctx.persistConfig();
      return host;
    },

    async deleteHost(hostId: number) {
      await gatewayApi(`/api/hosts/${hostId}`, { method: "DELETE" });
      useGatewayRealtimeStore().closeHostThreadEvents(hostId);
      ctx.state.hosts = ctx.state.hosts.filter((host) => host.id !== hostId);
      ctx.state.projects = ctx.state.projects.filter((project) => project.hostId !== hostId);
      const { [hostId]: _removedConnectionStatus, ...hostConnectionStatuses } =
        ctx.state.hostConnectionStatuses;
      ctx.state.hostConnectionStatuses = hostConnectionStatuses;
      ctx.state.gatewayConfig.pinnedThreads = ctx.state.gatewayConfig.pinnedThreads.filter(
        (thread) => thread.hostId !== hostId,
      );
      ctx.persistConfig();
      if (ctx.state.selectedHostId === hostId) {
        ctx.beginViewTransition();
        ctx.state.selectedHostId = ctx.state.hosts[0]?.id ?? null;
        ctx.state.selectedProjectId = null;
        ctx.state.selectedThreadId = null;
        ctx.state.threads = [];
        ctx.state.currentThread = null;
        ctx.state.history = null;
        ctx.state.events = [];
        ctx.clearError();
        ctx.state.olderTurnsCursor = null;
        ctx.state.newerTurnsCursor = null;
        ctx.state.models = [];
        ctx.state.modelsHostId = null;
        writeGatewayRouteSelection(
          {
            hostId: ctx.state.selectedHostId,
            projectId: null,
            threadId: null,
          },
          { replace: true },
        );
        if (ctx.state.selectedHostId) {
          await ctx.listModels();
          await ctx.listThreads();
        }
      }
    },

    async selectHost(hostId: number) {
      ctx.cacheSelectedThreadView();
      ctx.beginViewTransition();
      ctx.state.selectedHostId = hostId;
      const currentProject = ctx.state.projects.find(
        (project) => project.id === ctx.state.selectedProjectId,
      );
      if (!currentProject || currentProject.hostId !== hostId) {
        ctx.state.selectedProjectId = null;
      }
      ctx.state.selectedThreadId = null;
      ctx.state.currentThread = null;
      ctx.state.history = null;
      ctx.state.events = [];
      ctx.clearError();
      ctx.state.olderTurnsCursor = null;
      ctx.state.newerTurnsCursor = null;
      ctx.state.lastEventId = 0;
      ctx.state.models = [];
      ctx.state.modelsHostId = null;
      writeGatewayRouteSelection({ hostId, projectId: null, threadId: null });
      await ctx.listModels();
      await ctx.listThreads();
      ctx.ensureSelectedProject();
      if (ctx.state.selectedProjectId) {
        await ctx.listThreads();
      }
    },
  };
}
