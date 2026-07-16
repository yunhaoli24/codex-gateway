import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { gatewayDomainEvents } from "../domain-events";
import { runtimeStatusFromCompletedTurn } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";

export const turnEventHandlers: GatewayEventHandlerRegistry = {
  "turn/started": (event, params, threadId) => {
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: "running",
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (params.turn) {
      gatewayDomainEvents.emit("history-turn-appended", {
        hostId: event.hostId,
        threadId,
        turn: params.turn,
      });
    }
  },
  "turn/completed": (event, params, threadId) => {
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: runtimeStatusFromCompletedTurn(params.turn),
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (!params.turn) return;
    gatewayDomainEvents.emit("history-turn-synced", {
      hostId: event.hostId,
      threadId,
      turn: params.turn,
    });
    const turns = useGatewayThreadTurnsStore();
    turns.maybeRetryAfterTurnFailure(event.hostId, threadId, params.turn);
    if (params.turn.status !== "failed") turns.clearRequest(event.hostId, threadId);
  },
  "turn/diff/updated": (event, params, threadId) => {
    gatewayDomainEvents.emit("history-turn-diff-updated", {
      hostId: event.hostId,
      threadId,
      params,
    });
  },
  "turn/plan/updated": (event, params, threadId) => {
    gatewayDomainEvents.emit("history-item-upsert", {
      hostId: event.hostId,
      threadId,
      item: {
        type: "turnPlan",
        id: `${params.turnId}-plan`,
        turnId: params.turnId,
        explanation: params.explanation ?? null,
        plan: Array.isArray(params.plan) ? params.plan : [],
      },
    });
  },
};
