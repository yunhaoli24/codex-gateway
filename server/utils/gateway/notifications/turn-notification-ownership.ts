import type { GatewayEvent } from "~~/shared/types";
import { threadGoalFromUnknown } from "~~/shared/runtime/app-server";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import type { ThreadGoalResolver } from "../runtime/thread-runtime-events";
import { hostSessionEvents } from "../runtime/host-session-events";
import { currentGatewayUserId } from "../state/memory";
import { gatewayLog } from "../logging";
import { isTerminalGoalStatus } from "./thread-notification-formatters";

interface TurnOwnership {
  turnId: string | null;
  goalOwned: Promise<boolean>;
  terminalGoalOwned: Promise<boolean> | null;
}

class TurnNotificationOwnership {
  private readonly running = new Map<string, TurnOwnership>();

  constructor() {
    hostSessionEvents.onClosed(({ userId, hostId }) => {
      const prefix = `${userId}:${hostId}:`;
      for (const key of this.running.keys()) {
        if (key.startsWith(prefix)) this.running.delete(key);
      }
    });
  }

  started(event: GatewayEvent, resolveGoal: ThreadGoalResolver | undefined) {
    if (event.event.type !== "turn.started") return;
    const turnId = idFromUnknown(event.event.turn.id);
    if (turnId === null) return;
    // Goal completion is persisted beyond its final Turn. Capture ownership at Turn start,
    // rather than treating that persisted record (or a bounded replay log) as an active Goal.
    this.running.set(this.key(event), {
      turnId: String(turnId),
      goalOwned: this.inspectGoal(resolveGoal),
      terminalGoalOwned: null,
    });
  }

  async goalUpdated(event: GatewayEvent) {
    if (event.event.type !== "thread.goal.updated") return false;
    const goal = threadGoalFromUnknown(event.event.goal);
    if (goal === null) return false;
    const key = this.key(event);
    const turnId = event.event.turnId ?? null;
    let current = this.running.get(key);
    if (current === undefined) {
      // Resume re-emits the persisted Goal with null turnId, including old completed Goals.
      // Only an active Goal or an official exact Turn association establishes new ownership.
      // This also covers joining after turn/started: resume supplies the active Goal snapshot.
      if (goal.status === "complete" && turnId === null) return false;
      current = {
        turnId,
        goalOwned: Promise.resolve(true),
        terminalGoalOwned: null,
      };
      this.running.set(key, current);
    } else if (turnId !== null && current.turnId !== null && current.turnId !== turnId) {
      // A late terminal update from an earlier Turn can notify, but cannot claim the new Turn.
      return true;
    } else if (goal.status !== "complete" || turnId !== null) {
      current.turnId ??= turnId;
      current.goalOwned = Promise.resolve(true);
    }
    if (isTerminalGoalStatus(goal.status)) {
      // Capture before notification IO. A subsequent goal/clear must not enable a second Turn
      // notification after its terminal Goal notification has already been scheduled.
      current.terminalGoalOwned = current.goalOwned;
      return current.terminalGoalOwned;
    }
    return true;
  }

  completed(event: GatewayEvent, resolveGoal: ThreadGoalResolver | undefined) {
    const key = this.key(event);
    const current = this.running.get(key);
    const turnId =
      event.event.type === "turn.completed" ? idFromUnknown(event.event.turn.id) : null;
    if (current !== undefined && (current.turnId === null || current.turnId === turnId)) {
      this.running.delete(key);
      return current.goalOwned;
    }
    // Joining an already-running remote conversation may skip turn/started entirely.
    return this.inspectGoal(resolveGoal);
  }

  cleared(event: GatewayEvent) {
    const current = this.running.get(this.key(event));
    // An active Goal cleared before completion has no Goal notification; its Turn notifies.
    // If that Goal already ended, preserve the captured ownership to avoid notifying twice.
    if (current !== undefined)
      current.goalOwned = current.terminalGoalOwned ?? Promise.resolve(false);
  }

  private async inspectGoal(resolveGoal: ThreadGoalResolver | undefined) {
    if (resolveGoal === undefined) return false;
    try {
      const goal = threadGoalFromUnknown(recordFromUnknown(await resolveGoal())?.goal);
      return goal !== null && goal.status !== "complete";
    } catch (error) {
      gatewayLog("error", "gateway", "failed to inspect turn notification ownership", {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  private key(event: GatewayEvent) {
    return `${currentGatewayUserId()}:${event.hostId}:${event.threadId}`;
  }
}

export const turnNotificationOwnership = new TurnNotificationOwnership();
