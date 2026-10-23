import { match } from "ts-pattern";
import type { GatewayEvent } from "~~/shared/types";
import { notificationCenter } from "./notification-center";
import {
  threadAsyncUserQuestionNotification,
  threadGoalCompletedNotification,
  threadTurnCompletedNotification,
  threadUserInputRequestedNotification,
} from "./thread-notification-formatters";
import { shouldNotifyMainThread } from "./thread-notification-scope";
import type { ServerNotification } from "~~/shared/types";
import type { ThreadGoalResolver, ThreadMetadataResolver } from "../runtime/thread-runtime-events";
import { gatewayLog } from "../logging";
import { pendingServerRequests } from "../runtime/pending-server-requests";
import { turnNotificationOwnership } from "./turn-notification-ownership";

export function dispatchThreadRuntimeNotification(
  event: GatewayEvent,
  options: { resolveGoal?: ThreadGoalResolver; resolveThread?: ThreadMetadataResolver } = {},
) {
  match(event.event.type)
    .with("turn.started", () => {
      turnNotificationOwnership.started(event, options.resolveGoal);
    })
    .with("timeline.item.upsert", () => {
      void dispatchAsyncUserQuestion(event, options.resolveThread);
    })
    .with("thread.goal.updated", () => {
      void dispatchGoalUpdated(event, options.resolveThread);
    })
    .with("thread.goal.cleared", () => {
      turnNotificationOwnership.cleared(event);
    })
    .with("turn.completed", () => {
      void dispatchTurnCompleted(event, options.resolveGoal, options.resolveThread);
    })
    .with("serverRequest.requested", () => {
      if (
        event.event.type === "serverRequest.requested" &&
        event.event.requestKind === "userInput"
      ) {
        void dispatchUserInputRequested(event, options.resolveThread);
      }
    })
    .otherwise(() => undefined);
}

async function dispatchUserInputRequested(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  if (!(await shouldNotifyMainThread(event, resolveThread))) {
    return;
  }
  if (pendingServerRequests.isPending(event)) {
    dispatchIfPresent(threadUserInputRequestedNotification(event));
  }
}

async function dispatchAsyncUserQuestion(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  const notification = threadAsyncUserQuestionNotification(event);
  if (notification === null || !(await shouldNotifyMainThread(event, resolveThread))) return;
  dispatchIfPresent(notification);
}

async function dispatchGoalUpdated(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  const eligible = turnNotificationOwnership.goalUpdated(event);
  const notification = threadGoalCompletedNotification(event);
  if (
    notification === null ||
    !(await eligible) ||
    !(await shouldNotifyMainThread(event, resolveThread))
  ) {
    return;
  }
  dispatchIfPresent(notification);
}

async function dispatchTurnCompleted(
  event: GatewayEvent,
  resolveGoal: ThreadGoalResolver | undefined,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  // Take ownership synchronously, before metadata IO or a subsequent Turn can replace it.
  const goalOwned = turnNotificationOwnership.completed(event, resolveGoal);
  if (!(await shouldNotifyMainThread(event, resolveThread))) {
    return;
  }
  if (await goalOwned) {
    return;
  }
  dispatchIfPresent(threadTurnCompletedNotification(event));
}

function dispatchIfPresent(notification: ServerNotification | null) {
  if (notification !== null) {
    void notificationCenter.publish(notification).catch((error: unknown) => {
      gatewayLog("error", "gateway", "thread notification delivery failed", {
        key: notification.key,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
