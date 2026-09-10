import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { threadHistoryTurnFromUnknown } from "~~/shared/runtime/app-server";
import { runtimeStatusFromCompletedTurn } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";
import { useGatewayTurnRecoveryStore } from "@/stores/gateway-turn-recovery";
import { gatewayDomainEvents } from "../domain-events";

export const turnEventHandlers: GatewayEventHandlerRegistry = {
  "turn.started": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "turn.started") return;
    useGatewayTurnRecoveryStore().clearRequest(event.hostId, threadId);
    const turn = threadHistoryTurnFromUnknown(canonical.turn);
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: "running",
      turnId: turn === null ? null : String(turn.id),
    });
  },
  "turn.completed": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "turn.completed") return;
    const turn = threadHistoryTurnFromUnknown(canonical.turn);
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: runtimeStatusFromCompletedTurn(turn),
      turnId: turn === null ? null : String(turn.id),
    });
    if (turn === null) return;
    const turns = useGatewayThreadTurnsStore();
    turns.maybeRetryAfterTurnFailure(event.hostId, threadId, turn);
    if (turn.status !== "failed") turns.clearRequest(event.hostId, threadId);
  },
};
