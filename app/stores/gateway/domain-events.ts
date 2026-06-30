import type { ThreadSettingsState, ThreadTokenUsageState } from "~~/shared/types";
import type { ThreadRuntimeStatus } from "./types";

export type GatewayDomainEvent =
  | {
      type: "thread-status-detected";
      hostId: number;
      threadId: string;
      status: ThreadRuntimeStatus;
      notifyTerminal?: boolean;
      turnId?: string | null;
    }
  | {
      type: "thread-settings-detected";
      hostId: number;
      threadId: string;
      settings: ThreadSettingsState;
    }
  | {
      type: "thread-token-usage-detected";
      hostId: number;
      threadId: string;
      tokenUsage: ThreadTokenUsageState;
    }
  | { type: "history-item-upsert"; hostId: number; threadId: string; item: any }
  | { type: "history-agent-delta"; hostId: number; threadId: string; params: any }
  | { type: "history-plan-delta"; hostId: number; threadId: string; params: any }
  | { type: "history-reasoning-summary-delta"; hostId: number; threadId: string; params: any }
  | { type: "history-reasoning-text-delta"; hostId: number; threadId: string; params: any }
  | {
      type: "history-item-output-delta";
      hostId: number;
      threadId: string;
      params: any;
      itemType: "commandExecution" | "fileChange";
    }
  | {
      type: "history-server-request-resolved";
      hostId: number;
      threadId: string;
      requestId: string | number;
    }
  | { type: "history-turn-diff-updated"; hostId: number; threadId: string; params: any }
  | { type: "history-turn-appended"; hostId: number; threadId: string; turn: any }
  | { type: "history-turn-synced"; hostId: number; threadId: string; turn: any };

type EventType = GatewayDomainEvent["type"];
type EventFor<T extends EventType> = Extract<GatewayDomainEvent, { type: T }>;
type Handler<T extends EventType> = (event: EventFor<T>) => void;

export interface GatewayDomainEvents {
  on<T extends EventType>(type: T, handler: Handler<T>): () => void;
  emit(event: GatewayDomainEvent): void;
}

export function createGatewayDomainEvents(): GatewayDomainEvents {
  const handlers = new Map<EventType, Set<(event: GatewayDomainEvent) => void>>();

  return {
    on(type, handler) {
      const typedHandlers = handlers.get(type) ?? new Set();
      typedHandlers.add(handler as (event: GatewayDomainEvent) => void);
      handlers.set(type, typedHandlers);
      return () => {
        typedHandlers.delete(handler as (event: GatewayDomainEvent) => void);
      };
    },

    emit(event) {
      for (const handler of handlers.get(event.type) ?? []) {
        handler(event);
      }
    },
  };
}
