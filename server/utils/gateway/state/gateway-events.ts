import type { GatewayEvent } from "~~/shared/types";
import { rpcEnvelopeCreatedAt } from "~~/shared/types/records";
import { SERVER_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { gatewayMemoryState } from "./memory";

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
      // App-server time preserves the true event order across SSH/network latency.
      // Gateway-generated events have no emittedAtMs and intentionally use receive time.
      createdAt: rpcEnvelopeCreatedAt(payload),
    };
    gatewayMemoryState.events.push(event);
    this.prune(hostId, threadId, 500);
    this.pruneThreads(SERVER_THREAD_CACHE_LIMIT);
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

  latestId(hostId: number, threadId: string): number {
    return gatewayMemoryState.events.reduce((latest, event) => {
      if (event.hostId !== hostId || event.threadId !== threadId) {
        return latest;
      }
      return Math.max(latest, event.id);
    }, 0);
  },

  latest(hostId: number, threadId: string): GatewayEvent | null {
    return (
      gatewayMemoryState.events
        .filter((event) => event.hostId === hostId && event.threadId === threadId)
        .sort((left, right) => right.id - left.id)[0] ?? null
    );
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

  pruneThreads(keep: number) {
    const latestIds = new Map<string, number>();
    for (const event of gatewayMemoryState.events) {
      const key = `${event.hostId}:${event.threadId}`;
      latestIds.set(key, Math.max(latestIds.get(key) ?? 0, event.id));
    }
    if (latestIds.size <= keep) {
      return;
    }
    const retainedThreads = new Set(
      [...latestIds.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, keep)
        .map(([key]) => key),
    );
    gatewayMemoryState.events = gatewayMemoryState.events.filter((event) =>
      retainedThreads.has(`${event.hostId}:${event.threadId}`),
    );
  },
};
