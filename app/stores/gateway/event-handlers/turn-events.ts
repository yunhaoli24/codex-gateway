import { runtimeStatusFromCompletedTurn } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";

export const turnEventHandlers: GatewayEventHandlerRegistry = {
  "turn/started": (ctx, event, params, threadId) => {
    ctx.events.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: "running",
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (params.turn) {
      ctx.events.emit("history-turn-appended", {
        hostId: event.hostId,
        threadId,
        turn: params.turn,
      });
    }
  },
  "turn/completed": (ctx, event, params, threadId) => {
    ctx.events.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: runtimeStatusFromCompletedTurn(params.turn),
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (params.turn) {
      ctx.events.emit("history-turn-synced", {
        hostId: event.hostId,
        threadId,
        turn: params.turn,
      });
      useGatewayThreadTurnsStore().maybeRetryAfterTurnFailure(event.hostId, threadId, params.turn);
      if (params.turn?.status !== "failed") {
        useGatewayThreadTurnsStore().clearRequest(event.hostId, threadId);
      }
    }
  },
  "turn/diff/updated": (ctx, event, params, threadId) => {
    ctx.events.emit("history-turn-diff-updated", { hostId: event.hostId, threadId, params });
  },
  "turn/plan/updated": (ctx, event, params, threadId) => {
    ctx.events.emit("history-item-upsert", {
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
