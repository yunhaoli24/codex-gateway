import type { GatewayEvent } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { threadIdFromParams } from "../thread-utils/identity";
import { appServerEventDispatcher } from "./registry";

const transientErrorRecoveryBlockedMethods = new Set(["error"]);

export function applyAppServerEvent(event: GatewayEvent) {
  const params = (event.payload as any)?.params || {};
  const targetThreadId = threadIdFromParams(params) ?? event.threadId;
  if (!targetThreadId) return;
  const threadId = String(targetThreadId);
  clearRecoveredTransientError(event, params, threadId);
  appServerEventDispatcher.dispatch(event.method, { event, params, threadId });
}

function clearRecoveredTransientError(
  event: GatewayEvent,
  params: Record<string, any>,
  threadId: string,
) {
  const gateway = useGatewayStore();
  const current = gateway.error;
  if (!current?.transient || transientErrorRecoveryBlockedMethods.has(event.method)) return;
  const value = params.turnId ?? params.turn?.id;
  const eventTurnId = typeof value === "string" ? value : value == null ? null : String(value);
  if (
    eventTurnId &&
    current.turnId === eventTurnId &&
    current.hostId === event.hostId &&
    current.threadId === threadId
  ) {
    gateway.clearError();
  }
}
