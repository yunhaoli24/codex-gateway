import { currentGatewayUserId, runWithGatewayUser } from "../state/memory";

export interface HostSessionClosedEvent {
  userId: number;
  hostId: number;
}

type HostSessionClosedSubscriber = (event: HostSessionClosedEvent) => void;

class HostSessionEventBus {
  private readonly closeSubscribers = new Set<HostSessionClosedSubscriber>();

  emitClosed(hostId: number) {
    const userId = currentGatewayUserId();
    if (!userId) {
      return;
    }
    const event = { userId, hostId };
    for (const subscriber of this.closeSubscribers) {
      runWithGatewayUser(userId, () => subscriber(event));
    }
  }

  onClosed(subscriber: HostSessionClosedSubscriber) {
    this.closeSubscribers.add(subscriber);
    return () => {
      this.closeSubscribers.delete(subscriber);
    };
  }
}

export const hostSessionEvents = new HostSessionEventBus();
