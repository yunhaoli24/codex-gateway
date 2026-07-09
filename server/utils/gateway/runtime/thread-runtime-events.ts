import type { GatewayEvent } from "~~/shared/types";
import { gatewayEventStore } from "../state/gateway-events";
import { currentGatewayUserId } from "../state/memory";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { dispatchThreadRuntimeNotification } from "../notifications/thread-notification-dispatcher";
import { applyEventToOpenSnapshot } from "./open-snapshot-events";

type ThreadEventSubscriber = (event: GatewayEvent) => void;
export type ThreadGoalResolver = () => Promise<unknown>;
export type ThreadMetadataResolver = () => Promise<unknown>;

class ThreadRuntimeEventBus {
  private readonly subscribers = new Map<string, Set<ThreadEventSubscriber>>();

  record(
    hostId: number,
    threadId: string,
    method: string,
    payload: unknown,
    options: { resolveGoal?: ThreadGoalResolver; resolveThread?: ThreadMetadataResolver } = {},
  ) {
    const event = gatewayEventStore.add(hostId, threadId, method, payload);
    subAgentThreadStore.recordRuntimeEvent(hostId, threadId, method, payload);
    threadSnapshotStore.update(hostId, threadId, (snapshot) =>
      applyEventToOpenSnapshot(snapshot, method, payload, event.createdAt),
    );
    this.publish(event);
    dispatchThreadRuntimeNotification(event, options);
    return event;
  }

  subscribe(hostId: number, threadId: string, subscriber: ThreadEventSubscriber) {
    const key = this.key(currentUserId(), hostId, threadId);
    let subscribers = this.subscribers.get(key);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(key, subscribers);
    }
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) {
        this.subscribers.delete(key);
      }
    };
  }

  private publish(event: GatewayEvent) {
    for (const subscriber of this.subscribers.get(
      this.key(currentUserId(), event.hostId, event.threadId),
    ) ?? []) {
      subscriber(event);
    }
  }

  private key(userId: number, hostId: number, threadId: string) {
    return `${userId}:${hostId}:${threadId}`;
  }
}

function currentUserId() {
  const userId = currentGatewayUserId();
  if (!userId) {
    throw new Error("Thread runtime events require an authenticated user scope");
  }
  return userId;
}

export const threadRuntimeEvents = new ThreadRuntimeEventBus();
