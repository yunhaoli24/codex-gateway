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
import { gatewayDomainEvents } from "../domain-events";

const lifecycleNotificationKeys = new Set<string>();

export function registerGatewayLifecycleSubscribers() {
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
    catalog.projects = [...config.projects];
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
    // A normal reconnect resumes every thread from its explicit event epoch and cursor. Do not
    // also activate a full snapshot here: that races replay and discards accepted client-only
    // items such as steer messages. The server emits thread.events.gap when replay is impossible;
    // that single path below owns authoritative snapshot recovery.
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
        updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now(),
      },
    };
    const key = `${event.hostId}:${event.status}:${event.message}`;
    if (
      (event.status === "upgrading" || event.status === "restarting") &&
      !lifecycleNotificationKeys.has(key)
    ) {
      lifecycleNotificationKeys.add(key);
      toast.info(event.message);
    }
  });
}
