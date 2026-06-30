import { toast } from "vue-sonner";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayConfig, GatewayStatus } from "~~/shared/types";
import { defaultGatewayConfig } from "../config";
import type { GatewayStoreContext } from "../types";
import { messageFromError } from "../thread-utils/identity";
import {
  hasGatewayRouteSelection,
  readGatewayRouteSelection,
  writeGatewayRouteSelection,
} from "../route-state";

export function createCoreActions(ctx: GatewayStoreContext) {
  return {
    hydrateConfig() {
      ctx.state.gatewayConfig = defaultGatewayConfig();
      ctx.state.hosts = [];
      ctx.state.projects = [];
    },

    persistConfig() {
      ctx.state.gatewayConfig = {
        version: 1,
        hosts: ctx.state.hosts,
        projects: ctx.state.projects,
        pinnedThreads: ctx.state.gatewayConfig.pinnedThreads,
        lastOpenThread: ctx.state.gatewayConfig.lastOpenThread ?? null,
      };
    },

    async syncConfigToServer() {
      ctx.persistConfig();
      const syncedConfig = await gatewayApi<GatewayConfig>("/api/config/sync", {
        method: "POST",
        body: ctx.state.gatewayConfig,
      });
      ctx.state.gatewayConfig = { ...defaultGatewayConfig(), ...syncedConfig };
      ctx.state.hosts = ctx.state.gatewayConfig.hosts;
      ctx.state.projects = ctx.state.gatewayConfig.projects;
    },

    applyConfig(config: GatewayConfig) {
      ctx.state.gatewayConfig = {
        ...defaultGatewayConfig(),
        ...config,
      };
      ctx.state.hosts = ctx.state.gatewayConfig.hosts;
      ctx.state.projects = ctx.state.gatewayConfig.projects;
    },

    async loadConfigFromServer() {
      const config = await gatewayApi<GatewayConfig>("/api/config/export");
      ctx.applyConfig(config);
      ctx.persistConfig();
    },

    exportConfigText() {
      ctx.persistConfig();
      return JSON.stringify(ctx.state.gatewayConfig, null, 2);
    },

    async importConfigText(text: string) {
      const config = JSON.parse(text) as GatewayConfig;
      const syncedConfig = await gatewayApi<GatewayConfig>("/api/config/sync", {
        method: "POST",
        body: { ...defaultGatewayConfig(), ...config },
      });
      ctx.state.gatewayConfig = { ...defaultGatewayConfig(), ...syncedConfig };
      ctx.state.hosts = ctx.state.gatewayConfig.hosts;
      ctx.state.projects = ctx.state.gatewayConfig.projects;
      ctx.persistConfig();
      await ctx.refresh();
    },

    async refresh() {
      const refreshViewEpoch = ctx.state.viewEpoch;
      ctx.state.initializing = true;
      ctx.state.loading = true;
      ctx.clearError();
      try {
        const routeSelection = readGatewayRouteSelection();
        ctx.connectHostLifecycleEvents();
        ctx.state.projects = [];
        ctx.state.threads = [];
        ctx.state.models = [];
        await ctx.loadConfigFromServer();
        const status = await gatewayApi<GatewayStatus>("/api/status");
        ctx.state.status = status;

        const routeHostExists = routeSelection.hostId
          ? ctx.state.hosts.some((host) => host.id === routeSelection.hostId)
          : false;
        if (routeHostExists) {
          ctx.state.selectedHostId = routeSelection.hostId;
        } else if (!ctx.state.selectedHostId) {
          ctx.state.selectedHostId = ctx.state.hosts[0]?.id ?? null;
        }
        ctx.state.selectedProjectId = routeHostExists ? routeSelection.projectId : null;
        ctx.state.selectedThreadId = routeHostExists ? routeSelection.threadId : null;
        ctx.state.currentThread = null;
        ctx.state.history = null;
        ctx.state.events = [];
        ctx.state.olderTurnsCursor = null;
        ctx.state.newerTurnsCursor = null;

        await ctx.connectAllHosts();
        await ctx.listModels();
        await ctx.listThreads();
        if (!ctx.state.selectedProjectId) {
          ctx.ensureSelectedProject();
        }
        if (ctx.state.selectedProjectId) {
          await ctx.listThreads();
        }
        const viewUnchangedDuringRefresh = () => ctx.state.viewEpoch === refreshViewEpoch;
        if (routeHostExists && routeSelection.threadId && viewUnchangedDuringRefresh()) {
          await ctx.openThread(routeSelection.threadId, {
            hostId: routeSelection.hostId,
            projectId: routeSelection.projectId,
            replaceRoute: true,
          });
        } else if (
          !hasGatewayRouteSelection(routeSelection) &&
          ctx.state.gatewayConfig.lastOpenThread?.hostId &&
          viewUnchangedDuringRefresh()
        ) {
          await ctx.restoreLastOpenThread();
        } else if (viewUnchangedDuringRefresh()) {
          writeGatewayRouteSelection(
            {
              hostId: ctx.state.selectedHostId,
              projectId: ctx.state.selectedProjectId,
              threadId: null,
            },
            { replace: true },
          );
        }
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.bootstrapFailed"), ctx.errorLabels), {
          hostId: ctx.state.selectedHostId,
          projectId: ctx.state.selectedProjectId,
          threadId: ctx.state.selectedThreadId,
        });
      } finally {
        ctx.state.loading = false;
        ctx.state.initializing = false;
      }
    },

    clearError() {
      ctx.state.error = null;
    },

    setError(
      message: string,
      context: {
        hostId?: number | null;
        projectId?: number | null;
        threadId?: string | null;
      } = {},
    ) {
      ctx.state.error = {
        message,
        hostId: "hostId" in context ? (context.hostId ?? null) : ctx.state.selectedHostId,
        projectId:
          "projectId" in context ? (context.projectId ?? null) : ctx.state.selectedProjectId,
        threadId: "threadId" in context ? (context.threadId ?? null) : ctx.state.selectedThreadId,
        updatedAt: Date.now(),
      };
      if (import.meta.client) {
        toast.error(message);
      }
    },
  };
}
