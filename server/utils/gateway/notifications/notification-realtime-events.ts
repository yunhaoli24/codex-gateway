import { currentGatewayUserId } from "../state/memory";
import type { ServerNotification } from "~~/shared/types";

type NotificationSubscriber = (notification: ServerNotification) => void;

class NotificationRealtimeEvents {
  private readonly subscribersByUser = new Map<number, Set<NotificationSubscriber>>();

  publish(notification: ServerNotification) {
    const userId = currentGatewayUserId();
    if (!userId) {
      throw new Error("Realtime notifications require an authenticated user scope");
    }
    for (const subscriber of this.subscribersByUser.get(userId) ?? []) {
      try {
        subscriber(notification);
      } catch (error) {
        // A stale browser peer must not prevent delivery to the user's other peers.
        console.warn("[notifications] realtime subscriber rejected notification", error);
      }
    }
  }

  subscribe(userId: number, subscriber: NotificationSubscriber) {
    const subscribers = this.subscribersByUser.get(userId) ?? new Set<NotificationSubscriber>();
    subscribers.add(subscriber);
    this.subscribersByUser.set(userId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) {
        this.subscribersByUser.delete(userId);
      }
    };
  }
}

export const notificationRealtimeEvents = new NotificationRealtimeEvents();
