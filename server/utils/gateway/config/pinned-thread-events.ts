type PinnedThreadSubscriber = () => void;

class PinnedThreadEvents {
  private readonly subscribersByUser = new Map<number, Set<PinnedThreadSubscriber>>();

  publish(userId: number) {
    for (const subscriber of this.subscribersByUser.get(userId) ?? []) {
      try {
        subscriber();
      } catch (error) {
        console.warn("[gateway] pinned thread subscriber failed", error);
      }
    }
  }

  subscribe(userId: number, subscriber: PinnedThreadSubscriber) {
    const subscribers = this.subscribersByUser.get(userId) ?? new Set<PinnedThreadSubscriber>();
    subscribers.add(subscriber);
    this.subscribersByUser.set(userId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) this.subscribersByUser.delete(userId);
    };
  }
}

export const pinnedThreadEvents = new PinnedThreadEvents();
