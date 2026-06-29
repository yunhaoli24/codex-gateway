import type { GatewayEvent } from "~~/shared/types";
import { gatewayMemoryState, nowIso } from "./memory";

export const gatewayEventStore = {
  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.events = gatewayMemoryState.events.filter((event) =>
      hostIds.has(event.hostId),
    );
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.events = gatewayMemoryState.events.filter(
      (event) => event.hostId !== hostId,
    );
  },

  add(hostId: number, threadId: string, method: string, payload: unknown): GatewayEvent {
    const event = {
      id: gatewayMemoryState.nextEventId++,
      hostId,
      threadId,
      method,
      payload: payload as GatewayEvent["payload"],
      createdAt: nowIso(),
    };
    gatewayMemoryState.events.push(event);
    this.prune(hostId, threadId, 500);
    return event;
  },

  list(hostId: number, threadId: string, afterId = 0, limit = 200): GatewayEvent[] {
    return gatewayMemoryState.events
      .filter(
        (event) => event.hostId === hostId && event.threadId === threadId && event.id > afterId,
      )
      .sort((left, right) => left.id - right.id)
      .slice(0, limit);
  },

  prune(hostId: number, threadId: string, keep: number) {
    const retained = gatewayMemoryState.events
      .filter((event) => event.hostId === hostId && event.threadId === threadId)
      .sort((left, right) => right.id - left.id)
      .slice(0, keep)
      .map((event) => event.id);
    const retainedIds = new Set(retained);
    gatewayMemoryState.events = gatewayMemoryState.events.filter(
      (event) =>
        event.hostId !== hostId || event.threadId !== threadId || retainedIds.has(event.id),
    );
  },
};
