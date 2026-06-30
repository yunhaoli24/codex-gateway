import { terminalTurnStatus } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";

export const turnEventHandlers: GatewayEventHandlerRegistry = {
  "turn/started": (ctx, event, params, threadId, eventContext) => {
    ctx.events.emit({
      type: "thread-status-detected",
      hostId: event.hostId,
      threadId,
      status: "running",
      notifyTerminal: eventContext.notifyTerminal,
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (params.turn) {
      ctx.events.emit({
        type: "history-turn-appended",
        hostId: event.hostId,
        threadId,
        turn: params.turn,
      });
    }
  },
  "turn/completed": (ctx, event, params, threadId, eventContext) => {
    ctx.events.emit({
      type: "thread-status-detected",
      hostId: event.hostId,
      threadId,
      status: terminalTurnStatus(params.turn?.status),
      notifyTerminal: eventContext.notifyTerminal,
      turnId: params.turn?.id ? String(params.turn.id) : null,
    });
    if (params.turn) {
      ctx.events.emit({
        type: "history-turn-synced",
        hostId: event.hostId,
        threadId,
        turn: params.turn,
      });
    }
  },
  "turn/diff/updated": (ctx, event, params, threadId) => {
    ctx.events.emit({ type: "history-turn-diff-updated", hostId: event.hostId, threadId, params });
  },
  "turn/plan/updated": (ctx, event, params, threadId) => {
    ctx.events.emit({
      type: "history-item-upsert",
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
