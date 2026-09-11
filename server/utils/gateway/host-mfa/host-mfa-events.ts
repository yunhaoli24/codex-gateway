export type HostMfaEvent = {
  type: "request";
  hostId: number;
  name: string;
  instructions: string;
  prompts: Array<{ prompt: string; echo?: boolean }>;
};

type HostMfaListener = (event: HostMfaEvent) => void;

export class HostMfaEventBus {
  private listeners = new Map<number, Set<HostMfaListener>>();

  subscribe(userId: number, listener: HostMfaListener) {
    const listeners = this.listeners.get(userId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(userId);
    };
  }

  publish(userId: number, event: HostMfaEvent) {
    for (const listener of this.listeners.get(userId) ?? []) listener(event);
  }
}
