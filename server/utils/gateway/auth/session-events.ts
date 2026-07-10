type SessionRevokedListener = () => void;

class SessionRevocationEvents {
  private readonly listeners = new Map<string, Set<SessionRevokedListener>>();

  subscribe(tokenHash: string, listener: SessionRevokedListener) {
    const listeners = this.listeners.get(tokenHash) ?? new Set<SessionRevokedListener>();
    listeners.add(listener);
    this.listeners.set(tokenHash, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.listeners.delete(tokenHash);
      }
    };
  }

  emit(tokenHash: string) {
    for (const listener of this.listeners.get(tokenHash) ?? []) {
      listener();
    }
    this.listeners.delete(tokenHash);
  }
}

export const sessionRevocationEvents = new SessionRevocationEvents();
