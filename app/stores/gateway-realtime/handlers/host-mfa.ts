import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import type { RealtimeHandlers } from "./types";

export function createHostMfaRealtimeHandlers() {
  return {
    "host.mfa.request": (message) => {
      gatewayDomainEvents.emit("realtime-host-mfa-request", message);
    },
  } satisfies RealtimeHandlers;
}
