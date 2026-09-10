import type { GatewayEventHandlerRegistry } from "./types";
import { stringIdFromUnknown } from "~~/shared/utils/records";
import { gatewayDomainEvents } from "../domain-events";

export const deltaEventHandlers: GatewayEventHandlerRegistry = {
  "timeline.item.delta": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "timeline.item.delta") return;
    // The canonical history reducer already owns every delta's visible data.
    // This handler only publishes the runtime side effect that command output
    // implies. Keeping that side effect narrow avoids a second projection path
    // for agent text, plans, or reasoning and leaves future channels to their
    // provider adapter without empty compatibility branches.
    if (canonical.channel !== "commandOutput") return;
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: "running",
      turnId: stringIdFromUnknown(canonical.turnId),
    });
  },
};
