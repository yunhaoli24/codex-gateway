export type TerminalEvent =
  | {
      type: "terminal.output";
      sessionId: string;
      data: string;
      seq: number;
      createdAt: string;
    }
  | {
      type: "terminal.exited";
      sessionId: string;
      code: number | null;
      signal: string | null;
      createdAt: string;
    }
  | {
      type: "terminal.error";
      sessionId?: string;
      message: string;
    }
  | {
      type: "terminal.closed.event";
      sessionId: string;
    };

type TerminalEventListener = (event: TerminalEvent) => void;

export class TerminalEventBus {
  private listenersByUser = new Map<number, Set<TerminalEventListener>>();

  subscribe(userId: number, listener: TerminalEventListener) {
    let listeners = this.listenersByUser.get(userId);
    if (!listeners) {
      listeners = new Set();
      this.listenersByUser.set(userId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.listenersByUser.delete(userId);
      }
    };
  }

  publish(userId: number, event: TerminalEvent) {
    for (const listener of this.listenersByUser.get(userId) ?? []) {
      listener(event);
    }
  }
}

export const terminalEventBus = new TerminalEventBus();
