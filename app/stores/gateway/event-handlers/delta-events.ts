import type { GatewayEvent } from "~~/shared/types";
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
  "item/commandExecution/outputDelta": (event, params, threadId) =>
    emitOutputDelta(event, params, threadId, "commandExecution"),
  "item/fileChange/outputDelta": (event, params, threadId) =>
    emitOutputDelta(event, params, threadId, "fileChange"),
};

function emitOutputDelta(
  event: GatewayEvent,
  params: Record<string, any>,
  threadId: string,
  itemType: "commandExecution" | "fileChange",
) {
  gatewayDomainEvents.emit("thread-status-detected", {
    hostId: event.hostId,
    threadId,
    status: "running",
    turnId: params.turnId ? String(params.turnId) : null,
  });
  gatewayDomainEvents.emit("history-item-output-delta", {
    hostId: event.hostId,
    threadId,
    params,
    itemType,
  });
}
