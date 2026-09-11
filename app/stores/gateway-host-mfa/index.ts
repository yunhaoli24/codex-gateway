import { defineStore } from "pinia";
import { ref } from "vue";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";

export interface MfaRequest {
  hostId: number;
  name: string;
  instructions: string;
  prompts: Array<{ prompt: string; echo?: boolean }>;
}

export const useGatewayHostMfaStore = defineStore("gateway-host-mfa", () => {
  const pendingRequests = ref<Map<number, MfaRequest>>(new Map());

  function hasPendingMfa(hostId: number): boolean {
    return pendingRequests.value.has(hostId);
  }

  function getPendingMfa(hostId: number): MfaRequest | undefined {
    return pendingRequests.value.get(hostId);
  }

  function setPendingMfa(request: MfaRequest) {
    pendingRequests.value = new Map(pendingRequests.value).set(request.hostId, request);
  }

  function clearPendingMfa(hostId: number) {
    const next = new Map(pendingRequests.value);
    next.delete(hostId);
    pendingRequests.value = next;
  }

  function submitMfa(hostId: number, code: string) {
    const realtime = useGatewayRealtimeStore();
    realtime.send({ type: "host.mfa.submit", hostId, code });
    clearPendingMfa(hostId);
    useGatewayCatalogStore().setHostConnectionStatus(hostId, "connecting");
  }

  function connectMfaHost(hostId: number) {
    const realtime = useGatewayRealtimeStore();
    realtime.send({ type: "host.mfa.connect", hostId });
  }

  function dismissMfa(hostId: number) {
    const realtime = useGatewayRealtimeStore();
    realtime.send({ type: "host.mfa.cancel", hostId });
    clearPendingMfa(hostId);
    // Reset the catalog status so the sidebar no longer shows the MFA indicator
    const catalog = useGatewayCatalogStore();
    catalog.setHostConnectionStatus(hostId, "idle");
  }

  // Register domain event listener — called once during app setup
  function register() {
    gatewayDomainEvents.on("realtime-host-mfa-request", (request) => {
      setPendingMfa(request);
      // Update the catalog store so the sidebar UI reflects the new status
      const catalog = useGatewayCatalogStore();
      catalog.setHostConnectionStatus(request.hostId, "mfaRequired");
    });
    gatewayDomainEvents.on("realtime-host-lifecycle", ({ event }) => {
      if (event.status === "connected") clearPendingMfa(event.hostId);
    });
  }

  return {
    pendingRequests,
    hasPendingMfa,
    getPendingMfa,
    setPendingMfa,
    clearPendingMfa,
    submitMfa,
    connectMfaHost,
    dismissMfa,
    register,
  };
});
