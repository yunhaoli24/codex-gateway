export type HostLifecycleStatus =
  | 'checkingVersion'
  | 'upgrading'
  | 'restarting'
  | 'connecting'
  | 'connected'
  | 'failed'

export interface HostLifecycleEvent {
  hostId: number
  status: HostLifecycleStatus
  message: string
  createdAt: string
}

type HostLifecycleSubscriber = (event: HostLifecycleEvent) => void

class HostLifecycleBus {
  private subscribers = new Set<HostLifecycleSubscriber>()

  emit(event: Omit<HostLifecycleEvent, 'createdAt'>) {
    const payload = {
      ...event,
      createdAt: new Date().toISOString(),
    }
    for (const subscriber of this.subscribers) {
      subscriber(payload)
    }
  }

  subscribe(subscriber: HostLifecycleSubscriber) {
    this.subscribers.add(subscriber)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }
}

export const hostLifecycleBus = new HostLifecycleBus()
