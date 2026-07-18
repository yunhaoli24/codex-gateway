import { gatewayDomainEvents } from "../domain-events";
import type { GatewayEventHandlerRegistry } from "./types";

export const deltaEventHandlers: GatewayEventHandlerRegistry = {
  "item/agentMessage/delta": (event, params, threadId) =>
    gatewayDomainEvents.emit("history-agent-delta", { hostId: event.hostId, threadId, params }),
  "item/plan/delta": (event, params, threadId) =>
    gatewayDomainEvents.emit("history-plan-delta", { hostId: event.hostId, threadId, params }),
  "item/reasoning/summaryTextDelta": (event, params, threadId) =>
    gatewayDomainEvents.emit("history-reasoning-summary-delta", {
      hostId: event.hostId,
      threadId,
      params,
    }),
  "item/reasoning/textDelta": (event, params, threadId) =>
    gatewayDomainEvents.emit("history-reasoning-text-delta", {
      hostId: event.hostId,
      threadId,
      params,
    }),
  "item/commandExecution/outputDelta": (event, params, threadId) => {
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: "running",
      turnId: params.turnId ? String(params.turnId) : null,
    });
    gatewayDomainEvents.emit("history-command-output-delta", {
      hostId: event.hostId,
      threadId,
      params,
    });
  },
};
