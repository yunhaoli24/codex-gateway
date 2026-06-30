import { currentGatewayUserId, runWithGatewayUser } from "./memory";

export type HostLifecycleStatus =
  | "checkingVersion"
  | "upgrading"
  | "restarting"
  | "connecting"
  | "connected"
  | "failed";

export interface HostLifecycleEvent {
  hostId: number;
  status: HostLifecycleStatus;
  message: string;
  createdAt: string;
}

type HostLifecycleSubscriber = (event: HostLifecycleEvent) => void;

class HostLifecycleBus {
  private subscribers = new Map<number, Set<HostLifecycleSubscriber>>();

  emit(event: Omit<HostLifecycleEvent, "createdAt">) {
    const userId = currentGatewayUserId();
    if (!userId) {
      return;
    }
    const payload = {
      ...event,
      createdAt: new Date().toISOString(),
    };
    for (const subscriber of this.subscribers.get(userId) ?? []) {
      runWithGatewayUser(userId, () => subscriber(payload));
    }
  }

  subscribe(subscriber: HostLifecycleSubscriber) {
    const userId = currentGatewayUserId();
    if (!userId) {
      throw new Error("Host lifecycle subscription requires an authenticated user scope");
    }
    let subscribers = this.subscribers.get(userId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(userId, subscribers);
    }
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) {
        this.subscribers.delete(userId);
      }
    };
  }
}

export const hostLifecycleBus = new HostLifecycleBus();
