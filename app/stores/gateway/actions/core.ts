import { toast } from "vue-sonner";
import { klona } from "klona";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import type { GatewayConfig, GatewayNotificationSettings } from "~~/shared/types";
import { defaultGatewayConfig, normalizeNotificationSettings } from "../config";
import type { GatewayStoreContext } from "../types";
import { messageFromError } from "../thread-utils/identity";
import {
  hasGatewayRouteSelection,
  readGatewayRouteSelection,
  writeGatewayRouteSelection,
} from "../route-state";

export function createCoreActions(ctx: GatewayStoreContext) {
  let configSyncQueue: Promise<void> = Promise.resolve();
  let configSyncGeneration = 0;

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
        projects: ctx.state.gatewayConfig.projects,
        pinnedThreads: ctx.state.gatewayConfig.pinnedThreads,
        notifications: normalizeNotificationSettings(ctx.state.gatewayConfig.notifications),
      };
    },

    async syncConfigToServer() {
      ctx.persistConfig();
      const config = klona(ctx.state.gatewayConfig);
      const generation = ++configSyncGeneration;
      const sync = async () => {
        const syncedConfig = await syncGatewayConfig(config);
        if (generation !== configSyncGeneration) {
          return;
        }
        ctx.state.gatewayConfig = { ...defaultGatewayConfig(), ...syncedConfig };
        ctx.state.hosts = ctx.state.gatewayConfig.hosts;
        ctx.state.projects = ctx.state.gatewayConfig.projects;
      };
      const result = configSyncQueue.then(sync, sync);
      configSyncQueue = result.catch(() => {});
      return result;
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
      const syncedConfig = await syncGatewayConfig({
        ...defaultGatewayConfig(),
        ...config,
      });
      ctx.state.gatewayConfig = { ...defaultGatewayConfig(), ...syncedConfig };
      ctx.state.hosts = ctx.state.gatewayConfig.hosts;
      ctx.state.projects = ctx.state.gatewayConfig.projects;
      ctx.persistConfig();
      await ctx.refresh();
    },

    async saveNotificationSettings(notifications: GatewayNotificationSettings) {
      ctx.state.gatewayConfig.notifications = normalizeNotificationSettings(notifications);
      await ctx.syncConfigToServer();
      if (import.meta.client) {
        toast.success(ctx.t("app.notificationSettingsSaved"));
      }
    },

    async refresh() {
      const refreshViewEpoch = ctx.state.viewEpoch;
      ctx.state.initializing = true;
      ctx.state.loading = true;
      ctx.clearError();
      try {
        const routeSelection = readGatewayRouteSelection();
        useGatewayRealtimeStore().connectHostLifecycleEvents();
        ctx.state.projects = [];
        ctx.state.projectDirectoryAvailability = {};
        ctx.state.threads = [];
        ctx.state.models = [];
        ctx.state.modelsHostId = null;
        await ctx.loadConfigFromServer();

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

        const viewUnchangedDuringRefresh = () => ctx.state.viewEpoch === refreshViewEpoch;
        if (routeHostExists && routeSelection.threadId && viewUnchangedDuringRefresh()) {
          ctx.state.initializing = false;
          ctx.state.loading = false;
          await ctx.openThread(routeSelection.threadId, {
            hostId: routeSelection.hostId,
            projectId: routeSelection.projectId,
            replaceRoute: true,
          });
          hydrateNavigationDataInBackground(ctx);
        } else {
          await hydrateNavigationData(ctx);
          if (
            !hasGatewayRouteSelection(routeSelection) &&
            viewUnchangedDuringRefresh() &&
            (await ctx.restoreLastOpenThread())
          ) {
            // Restored the last browser-local UI selection.
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
        turnId?: string | null;
        transient?: boolean;
      } = {},
    ) {
      ctx.state.error = {
        message,
        hostId: "hostId" in context ? (context.hostId ?? null) : ctx.state.selectedHostId,
        projectId:
          "projectId" in context ? (context.projectId ?? null) : ctx.state.selectedProjectId,
        threadId: "threadId" in context ? (context.threadId ?? null) : ctx.state.selectedThreadId,
        turnId: "turnId" in context ? (context.turnId ?? null) : null,
        transient: context.transient === true,
        updatedAt: Date.now(),
      };
      if (import.meta.client) {
        toast.error(message);
      }
    },
  };
}

async function syncGatewayConfig(config: GatewayConfig) {
  return await gatewayApi<GatewayConfig>("/api/config/sync", {
    method: "POST",
    body: config,
  });
}

async function hydrateNavigationData(ctx: GatewayStoreContext) {
  const anchor = navigationHydrationAnchor(ctx);
  await ctx.connectAllHosts();
  if (!canContinueNavigationHydration(ctx, anchor)) {
    return;
  }
  await ctx.listModels();
  if (!canContinueNavigationHydration(ctx, anchor)) {
    return;
  }
  await ctx.listThreads();
  if (!canContinueNavigationHydration(ctx, anchor)) {
    return;
  }
  if (!ctx.state.selectedProjectId) {
    ctx.ensureSelectedProject();
  }
  if (!canContinueNavigationHydration(ctx, anchor)) {
    return;
  }
  if (ctx.state.selectedProjectId) {
    await ctx.listThreads();
  }
}

function hydrateNavigationDataInBackground(ctx: GatewayStoreContext) {
  void hydrateNavigationData(ctx).catch((error: unknown) => {
    ctx.setError(messageFromError(error, ctx.t("app.bootstrapFailed"), ctx.errorLabels), {
      hostId: ctx.state.selectedHostId,
      projectId: ctx.state.selectedProjectId,
      threadId: ctx.state.selectedThreadId,
    });
  });
}

function navigationHydrationAnchor(ctx: GatewayStoreContext) {
  return {
    hostId: ctx.state.selectedHostId,
    threadId: ctx.state.selectedThreadId,
  };
}

function canContinueNavigationHydration(
  ctx: GatewayStoreContext,
  anchor: ReturnType<typeof navigationHydrationAnchor>,
) {
  if (
    ctx.state.selectedHostId !== anchor.hostId ||
    ctx.state.selectedThreadId !== anchor.threadId
  ) {
    return false;
  }
  return !anchor.hostId || ctx.state.hosts.some((host) => host.id === anchor.hostId);
}
