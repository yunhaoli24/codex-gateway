import { EventEmitter } from "@posva/event-emitter";
import type { GatewayEvent } from "~~/shared/types";
import { notificationCenter } from "./notification-center";
import {
  threadGoalCompletedNotification,
  threadTurnCompletedNotification,
} from "./thread-notification-formatters";
import { shouldNotifyMainThread } from "./thread-notification-scope";
import type { ServerNotification } from "~~/shared/types";
import type { ThreadGoalResolver, ThreadMetadataResolver } from "../runtime/thread-runtime-events";

type ThreadNotificationEventMap = {
  "thread/goal/updated": [
    event: GatewayEvent,
    resolveGoal?: ThreadGoalResolver,
    resolveThread?: ThreadMetadataResolver,
  ];
  "turn/completed": [
    event: GatewayEvent,
    resolveGoal?: ThreadGoalResolver,
    resolveThread?: ThreadMetadataResolver,
  ];
};

const threadNotifications = new EventEmitter<ThreadNotificationEventMap>();

threadNotifications.on("thread/goal/updated", (event, _resolveGoal, resolveThread) => {
  void dispatchGoalUpdated(event, resolveThread);
});

threadNotifications.on("turn/completed", (event, resolveGoal, resolveThread) => {
  void dispatchTurnCompleted(event, resolveGoal, resolveThread);
});

export function dispatchThreadRuntimeNotification(
  event: GatewayEvent,
  options: { resolveGoal?: ThreadGoalResolver; resolveThread?: ThreadMetadataResolver } = {},
) {
  threadNotifications.emit(
    event.method as keyof ThreadNotificationEventMap,
    event,
    options.resolveGoal,
    options.resolveThread,
  );
}

async function dispatchGoalUpdated(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  if (!(await shouldNotifyMainThread(event, resolveThread))) {
    return;
  }
  dispatchIfPresent(threadGoalCompletedNotification(event));
}

async function dispatchTurnCompleted(
  event: GatewayEvent,
  resolveGoal: ThreadGoalResolver | undefined,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  if (!(await shouldNotifyMainThread(event, resolveThread))) {
    return;
  }
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
