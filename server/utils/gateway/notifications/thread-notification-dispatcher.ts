import { EventEmitter } from "@posva/event-emitter";
import type { GatewayEvent } from "~~/shared/types";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { notificationCenter } from "./notification-center";
import {
  threadGoalCompletedNotification,
  threadTurnCompletedNotification,
} from "./thread-notification-formatters";
import type { ServerNotification } from "./types";
import type { ThreadGoalResolver } from "../runtime/thread-runtime-events";

type ThreadNotificationEventMap = {
  "thread/goal/updated": [event: GatewayEvent, resolveGoal?: ThreadGoalResolver];
  "turn/completed": [event: GatewayEvent, resolveGoal?: ThreadGoalResolver];
};

const threadNotifications = new EventEmitter<ThreadNotificationEventMap>();

threadNotifications.on("thread/goal/updated", (event) => {
  dispatchIfPresent(threadGoalCompletedNotification(event));
});

threadNotifications.on("turn/completed", (event, resolveGoal) => {
  void dispatchTurnCompleted(event, resolveGoal);
});

export function dispatchThreadRuntimeNotification(
  event: GatewayEvent,
  options: { resolveGoal?: ThreadGoalResolver } = {},
) {
  if (subAgentThreadStore.isSubAgentThread(event.hostId, event.threadId)) {
    return;
  }
  threadNotifications.emit(
    event.method as keyof ThreadNotificationEventMap,
    event,
    options.resolveGoal,
  );
}

async function dispatchTurnCompleted(
  event: GatewayEvent,
  resolveGoal: ThreadGoalResolver | undefined,
) {
  if (resolveGoal && (await threadHasGoal(resolveGoal))) {
    return;
  }
  dispatchIfPresent(threadTurnCompletedNotification(event));
}

async function threadHasGoal(resolveGoal: ThreadGoalResolver) {
  try {
    const result = (await resolveGoal()) as any;
    return Boolean(result?.goal);
  } catch (error) {
    console.error("[gateway] failed to inspect thread goal before notification", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

function dispatchIfPresent(notification: ServerNotification | null) {
  if (notification) {
    notificationCenter.publish(notification);
  }
}
