import { match } from "ts-pattern";
import type { GatewayEvent } from "~~/shared/types";
import { notificationCenter } from "./notification-center";
import {
  threadGoalCompletedNotification,
  threadTurnCompletedNotification,
  threadUserInputRequestedNotification,
} from "./thread-notification-formatters";
import { shouldNotifyMainThread } from "./thread-notification-scope";
import type { ServerNotification } from "~~/shared/types";
import type { ThreadGoalResolver, ThreadMetadataResolver } from "../runtime/thread-runtime-events";
import { recordFromUnknown } from "~~/shared/utils/records";
import { pendingServerRequests } from "../runtime/pending-server-requests";

export function dispatchThreadRuntimeNotification(
  event: GatewayEvent,
  options: { resolveGoal?: ThreadGoalResolver; resolveThread?: ThreadMetadataResolver } = {},
) {
  match(event.event.type)
    .with("thread.goal.updated", () => {
      void dispatchGoalUpdated(event, options.resolveThread);
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
  if (!pendingServerRequests.isPending(event)) return;
  dispatchIfPresent(threadUserInputRequestedNotification(event));
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
  if (resolveGoal !== undefined && (await threadHasGoal(resolveGoal))) {
    return;
  }
  dispatchIfPresent(threadTurnCompletedNotification(event));
}

async function threadHasGoal(resolveGoal: ThreadGoalResolver) {
  try {
    const goal = recordFromUnknown(await resolveGoal())?.goal;
    return goal !== null && goal !== undefined;
  } catch (error) {
    console.error("[gateway] failed to inspect thread goal before notification", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

function dispatchIfPresent(notification: ServerNotification | null) {
  if (notification !== null) {
    void notificationCenter.publish(notification).catch((error: unknown) => {
      console.error("[gateway] thread notification delivery failed", {
        key: notification.key,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
