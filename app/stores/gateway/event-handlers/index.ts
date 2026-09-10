import type { GatewayEvent } from "~~/shared/types";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { appServerEventDispatcher } from "./registry";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";

const transientErrorRecoveryBlockedTypes = new Set(["error.reported"]);

export function applyAppServerEvent(event: GatewayEvent) {
  const canonicalEvent = event.event;
  const threadId = event.threadId;
  clearRecoveredTransientError(event, threadId);
  appServerEventDispatcher.dispatch(canonicalEvent.type, { event, threadId });
}

function clearRecoveredTransientError(event: GatewayEvent, threadId: string) {
  const gateway = useGatewayBootstrapStore();
  const current = gateway.error;
  if (current?.transient !== true || transientErrorRecoveryBlockedTypes.has(event.event.type))
    return;
  const value = turnIdFromEvent(event.event);
  const eventTurnIdValue = idFromUnknown(value);
  const eventTurnId = eventTurnIdValue === null ? null : String(eventTurnIdValue);
  if (
    eventTurnId !== null &&
    current.turnId === eventTurnId &&
    current.hostId === event.hostId &&
    current.threadId === threadId
  ) {
    gateway.clearError();
  }
}

function turnIdFromEvent(event: import("~~/shared/agent/events").AgentEvent) {
  if (event.type === "turn.started" || event.type === "turn.completed") {
    return recordFromUnknown(event.turn)?.id;
  }
  if (
    event.type === "turn.diff.updated" ||
    event.type === "turn.plan.updated" ||
    event.type === "timeline.item.delta"
  ) {
    return event.type === "turn.diff.updated" ? event.turnId : event.turnId;
  }
  if (event.type === "timeline.item.upsert") return event.item.turnId;
  return null;
}
