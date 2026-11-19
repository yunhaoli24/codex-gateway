import { toast } from "@codex-gateway/ui/sonner";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayConfigStore } from "@/stores/gateway-config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { setRealtimeRequestContextResolver } from "@/stores/gateway-realtime/request-context";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayHostMetricsDataStore } from "@/stores/gateway-host-metrics/data";
import { useGatewayProjectDefaultsStore } from "@/stores/gateway-project-defaults";
import { recoverSelectedThreadSettings } from "@/stores/gateway-composer/thread-settings-recovery";
import { useEventListener } from "@vueuse/core";
import { gatewayDomainEvents } from "../domain-events";
import { hostLifecycleMessage } from "@/utils/host-lifecycle-message";
import { useGatewayTranslator } from "@/composables/i18n/useGatewayTranslator";

const lifecycleNotificationKeys = new Set<string>();

export function registerGatewayLifecycleSubscribers() {
  const t = useGatewayTranslator();
  // A tab can be suspended without losing its WebSocket. Visibility recovery therefore belongs to
  // this one-time client lifecycle, not to either layout: switching device layouts would otherwise
  // register duplicate listeners. A reconnect still follows the explicit realtime-reconnected path.
  useEventListener(
    () => (import.meta.client ? document : null),
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") void recoverSelectedThreadSettings();
    },
  );
  setRealtimeRequestContextResolver((request) => {
    if (!("hostId" in request)) return {};
    const hostName = useGatewayCatalogStore().hosts.find(
      (host) => host.id === request.hostId,
    )?.name;
    return hostName === undefined || hostName === "" ? {} : { hostName };
  });

  gatewayDomainEvents.on("gateway-session-reset", () => {
    lifecycleNotificationKeys.clear();
    useGatewayHostMetricsDataStore().reset();
    useGatewayProjectDefaultsStore().reset();
  });
  gatewayDomainEvents.on("gateway-config-applied", ({ config }) => {
    const catalog = useGatewayCatalogStore();
    catalog.hosts = [...config.hosts];
    // Directory groups are discovered runtime state. Saving pins/notifications must not erase
    // them or make them part of the durable account configuration.
    const hostIds = new Set(config.hosts.map((host) => host.id));
    catalog.projects = catalog.projects.filter((project) => hostIds.has(project.hostId));
  });
  gatewayDomainEvents.on("host-removed", ({ hostId }) => {
    useGatewayRealtimeStore().closeHostThreadEvents(hostId);
    useGatewayHostMetricsDataStore().clearHost(hostId);
    useGatewayProjectDefaultsStore().clearHost(hostId);
  });
  gatewayDomainEvents.on("pinned-threads-invalidated", () => {
    const navigation = useGatewayNavigationStore();
    void useGatewayConfigStore()
      .refreshPinnedThreads()
      .then(async () => {
        // The server projection is the only pin authority for GatewayThread. Refetch the selected
        // catalog instead of re-projecting app-server data in the browser after a cross-tab update.
        if (navigation.selectedHostId !== null) await navigation.listThreads();
      })
      .catch((error: unknown) => {
        console.warn("[gateway] failed to refresh pinned threads", error);
      });
  });
  gatewayDomainEvents.on("realtime-reconnected", () => {
    useGatewayBrowserStore().resetRuntime();
    // Settings can change in another Codex client without a subscribed notification. Refresh only
    // that metadata here; activating a full snapshot would race replay and discard accepted
    // client-only items such as steer messages. A thread.events.gap remains the sole owner of
    // authoritative timeline recovery when replay is impossible.
    void recoverSelectedThreadSettings();
  });
  gatewayDomainEvents.on("realtime-thread-events-gap", ({ hostId, threadId }) => {
    void useGatewayThreadViewStore().recoverThreadEventGap(hostId, threadId);
  });
  gatewayDomainEvents.on("realtime-error-reported", (event) => {
    useGatewayBootstrapStore().setError(event.message, {
      hostId: event.hostId,
      threadId: event.threadId,
    });
  });
  gatewayDomainEvents.on("realtime-host-lifecycle", ({ event }) => {
    const catalog = useGatewayCatalogStore();
    const eventTime =
      event.createdAt === null || event.createdAt === undefined
        ? Date.now()
        : Date.parse(event.createdAt);
    const current = catalog.hostConnectionStatuses[event.hostId];
    if (
      current?.updatedAt !== undefined &&
      Number.isFinite(eventTime) &&
      eventTime < current.updatedAt
    ) {
      return;
    }
    const status =
      event.status === "connecting" && current?.status === "mfaConnecting"
        ? "mfaConnecting"
        : event.status;
    catalog.hostConnectionStatuses = {
      ...catalog.hostConnectionStatuses,
      [event.hostId]: {
        status,
        message: event.message,
        messageTranslation: event.messageTranslation,
        updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now(),
        // Normal SSH lifecycle events do not own upload counters. Only an upgrade update (including
        // its explicit null at completion/failure) may replace the shared progress snapshot.
        upgradeProgress:
          event.upgradeProgress === undefined ? current?.upgradeProgress : event.upgradeProgress,
      },
    };
    const key = `${event.hostId}:${event.status}:${event.message}`;
    if (
      (event.status === "upgrading" || event.status === "restarting") &&
      !lifecycleNotificationKeys.has(key)
    ) {
      lifecycleNotificationKeys.add(key);
      toast.info(hostLifecycleMessage(event, t));
    }
  });
}
