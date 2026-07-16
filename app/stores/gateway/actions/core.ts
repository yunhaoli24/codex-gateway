import { toast } from "vue-sonner";
import { klona } from "klona";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import type { GatewayConfig, GatewayNotificationSettings } from "~~/shared/types";
import { defaultGatewayConfig, normalizeNotificationSettings } from "../config";
import { messageFromError } from "../thread-utils/identity";
import {
  hasGatewayRouteSelection,
  readGatewayRouteSelection,
  writeGatewayRouteSelection,
} from "../route-state";

export function createCoreActions() {
  let configSyncQueue: Promise<void> = Promise.resolve();
  let configSyncGeneration = 0;

  function persistConfig() {
    const gateway = useGatewayStore();
    gateway.gatewayConfig = {
      version: 1,
      hosts: gateway.hosts,
      projects: gateway.gatewayConfig.projects,
      pinnedThreads: gateway.gatewayConfig.pinnedThreads,
      notifications: normalizeNotificationSettings(gateway.gatewayConfig.notifications),
    };
  }

  function applyConfig(config: GatewayConfig) {
    const gateway = useGatewayStore();
    gateway.gatewayConfig = { ...defaultGatewayConfig(), ...config };
    gateway.hosts = gateway.gatewayConfig.hosts;
    gateway.projects = gateway.gatewayConfig.projects;
  }

  async function syncConfigToServer() {
    persistConfig();
    const gateway = useGatewayStore();
    const config = klona(gateway.gatewayConfig);
    const generation = ++configSyncGeneration;
    const sync = async () => {
      const syncedConfig = await syncGatewayConfig(config);
      if (generation === configSyncGeneration) applyConfig(syncedConfig);
    };
    const result = configSyncQueue.then(sync, sync);
    configSyncQueue = result.catch(() => {});
    return result;
  }

  return {
    hydrateConfig() {
      const gateway = useGatewayStore();
      gateway.gatewayConfig = defaultGatewayConfig();
      gateway.hosts = [];
      gateway.projects = [];
    },
    persistConfig,
    syncConfigToServer,
    applyConfig,
    async loadConfigFromServer() {
      applyConfig(await gatewayApi<GatewayConfig>("/api/config/export"));
      persistConfig();
    },
    exportConfigText() {
      persistConfig();
      return JSON.stringify(useGatewayStore().gatewayConfig, null, 2);
    },
    async importConfigText(text: string) {
      applyConfig(
        await syncGatewayConfig({
          ...defaultGatewayConfig(),
          ...(JSON.parse(text) as GatewayConfig),
        }),
      );
      persistConfig();
      await useGatewayStore().refresh();
    },
    async saveNotificationSettings(notifications: GatewayNotificationSettings) {
      const gateway = useGatewayStore();
      gateway.gatewayConfig.notifications = normalizeNotificationSettings(notifications);
      await syncConfigToServer();
      if (import.meta.client) toast.success(gateway.t("app.notificationSettingsSaved"));
    },
    async refresh() {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const refreshViewEpoch = views.viewEpoch;
      gateway.initializing = true;
      views.loading = true;
      gateway.clearError();
      try {
        const routeSelection = readGatewayRouteSelection();
        useGatewayRealtimeStore().connectHostLifecycleEvents();
        gateway.projects = [];
        gateway.projectDirectoryAvailability = {};
        navigation.threads = [];
        gateway.models = [];
        gateway.modelsHostId = null;
        await gateway.loadConfigFromServer();

        const routeHostExists = routeSelection.hostId
          ? gateway.hosts.some((host) => host.id === routeSelection.hostId)
          : false;
        if (routeHostExists) navigation.selectedHostId = routeSelection.hostId;
        else if (!navigation.selectedHostId)
          navigation.selectedHostId = gateway.hosts[0]?.id ?? null;
        navigation.selectedProjectId = routeHostExists ? routeSelection.projectId : null;
        navigation.selectedThreadId = routeHostExists ? routeSelection.threadId : null;
        views.resetCurrentView();

        const viewUnchanged = () => views.viewEpoch === refreshViewEpoch;
        if (routeHostExists && routeSelection.threadId && viewUnchanged()) {
          gateway.initializing = false;
          views.loading = false;
          await views.openThread(routeSelection.threadId, {
            hostId: routeSelection.hostId!,
            projectId: routeSelection.projectId,
            replaceRoute: true,
          });
          hydrateNavigationDataInBackground();
        } else {
          await hydrateNavigationData();
          if (
            !hasGatewayRouteSelection(routeSelection) &&
            viewUnchanged() &&
            (await views.restoreLastOpenThread())
          ) {
            // Restored browser-local route selection.
          } else if (viewUnchanged()) {
            writeGatewayRouteSelection(
              {
                hostId: navigation.selectedHostId,
                projectId: navigation.selectedProjectId,
                threadId: null,
              },
              { replace: true },
            );
          }
        }
      } catch (error: any) {
        gateway.setError(
          messageFromError(error, gateway.t("app.bootstrapFailed"), gateway.errorLabels),
          {
            hostId: navigation.selectedHostId,
            projectId: navigation.selectedProjectId,
            threadId: navigation.selectedThreadId,
          },
        );
      } finally {
        views.loading = false;
        gateway.initializing = false;
      }
    },
    clearError() {
      useGatewayStore().error = null;
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
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      gateway.error = {
        message,
        hostId: "hostId" in context ? (context.hostId ?? null) : navigation.selectedHostId,
        projectId:
          "projectId" in context ? (context.projectId ?? null) : navigation.selectedProjectId,
        threadId: "threadId" in context ? (context.threadId ?? null) : navigation.selectedThreadId,
        turnId: "turnId" in context ? (context.turnId ?? null) : null,
        transient: context.transient === true,
        updatedAt: Date.now(),
      };
      if (import.meta.client) toast.error(message);
    },
  };
}

async function syncGatewayConfig(config: GatewayConfig) {
  return gatewayApi<GatewayConfig>("/api/config/sync", { method: "POST", body: config });
}

async function hydrateNavigationData() {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const anchor = navigationHydrationAnchor();
  await navigation.connectAllHosts();
  if (!canContinueNavigationHydration(anchor)) return;
  await gateway.listModels();
  if (!canContinueNavigationHydration(anchor)) return;
  await navigation.listThreads();
  if (!canContinueNavigationHydration(anchor)) return;
  if (!navigation.selectedProjectId) gateway.ensureSelectedProject();
  if (canContinueNavigationHydration(anchor) && navigation.selectedProjectId) {
    await navigation.listThreads();
  }
}

function hydrateNavigationDataInBackground() {
  void hydrateNavigationData().catch((error: unknown) => {
    const gateway = useGatewayStore();
    const navigation = useGatewayNavigationStore();
    gateway.setError(
      messageFromError(error, gateway.t("app.bootstrapFailed"), gateway.errorLabels),
      {
        hostId: navigation.selectedHostId,
        projectId: navigation.selectedProjectId,
        threadId: navigation.selectedThreadId,
      },
    );
  });
}

function navigationHydrationAnchor() {
  const navigation = useGatewayNavigationStore();
  return { hostId: navigation.selectedHostId, threadId: navigation.selectedThreadId };
}

function canContinueNavigationHydration(anchor: ReturnType<typeof navigationHydrationAnchor>) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  return (
    navigation.selectedHostId === anchor.hostId &&
    navigation.selectedThreadId === anchor.threadId &&
    (!anchor.hostId || gateway.hosts.some((host) => host.id === anchor.hostId))
  );
}
