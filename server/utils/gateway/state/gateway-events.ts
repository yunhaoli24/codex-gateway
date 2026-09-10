import type { GatewayEvent } from "~~/shared/types";
import type { AgentEvent } from "~~/shared/agent/events";
import { SERVER_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { gatewayMemoryState } from "./memory";
import { randomUUID } from "node:crypto";

export const gatewayEventStore = {
  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.events = gatewayMemoryState.events.filter((event) =>
      hostIds.has(event.hostId),
    );
    gatewayMemoryState.eventPrunedThroughByThread = Object.fromEntries(
      Object.entries(gatewayMemoryState.eventPrunedThroughByThread).filter(([key]) =>
        hostIds.has(hostIdFromEventKey(key)),
      ),
    );
    gatewayMemoryState.eventEpochByHost = Object.fromEntries(
      Object.entries(gatewayMemoryState.eventEpochByHost).filter(([hostId]) =>
        hostIds.has(Number(hostId)),
      ),
    );
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.events = gatewayMemoryState.events.filter(
      (event) => event.hostId !== hostId,
    );
    gatewayMemoryState.eventPrunedThroughByThread = Object.fromEntries(
      Object.entries(gatewayMemoryState.eventPrunedThroughByThread).filter(
        ([key]) => hostIdFromEventKey(key) !== hostId,
      ),
    );
    this.rotateHostEpoch(hostId);
  },

  epoch(hostId: number) {
    const key = String(hostId);
    const existing = gatewayMemoryState.eventEpochByHost[key];
    if (existing !== undefined) return existing;
    const epoch = randomUUID();
    gatewayMemoryState.eventEpochByHost = {
      ...gatewayMemoryState.eventEpochByHost,
      [key]: epoch,
    };
    return epoch;
  },

  rotateHostEpoch(hostId: number) {
    gatewayMemoryState.eventEpochByHost = {
      ...gatewayMemoryState.eventEpochByHost,
      [String(hostId)]: randomUUID(),
    };
  },

  add(hostId: number, threadId: string, event: AgentEvent, createdAt: string): GatewayEvent {
    const gatewayEvent: GatewayEvent = {
      id: gatewayMemoryState.nextEventId++,
      hostId,
      threadId,
      event,
      createdAt,
    };
    gatewayMemoryState.events.push(gatewayEvent);
    this.prune(hostId, threadId, 500);
    this.pruneThreads(SERVER_THREAD_CACHE_LIMIT);
    return gatewayEvent;
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

  hasReplayGap(hostId: number, threadId: string, afterId: number) {
    if (afterId <= 0) return false;
    const latestId = this.latestId(hostId, threadId);
    return (
      afterId > latestId ||
      afterId < (gatewayMemoryState.eventPrunedThroughByThread[eventKey(hostId, threadId)] ?? 0)
    );
  },

  prune(hostId: number, threadId: string, keep: number) {
    const retained = gatewayMemoryState.events
      .filter((event) => event.hostId === hostId && event.threadId === threadId)
      .sort((left, right) => right.id - left.id)
      .slice(0, keep)
      .map((event) => event.id);
    const retainedIds = new Set(retained);
    recordPrunedEvents(
      gatewayMemoryState.events.filter(
        (event) =>
          event.hostId === hostId && event.threadId === threadId && !retainedIds.has(event.id),
      ),
    );
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
    recordPrunedEvents(
      gatewayMemoryState.events.filter(
        (event) => !retainedThreads.has(eventKey(event.hostId, event.threadId)),
      ),
    );
    gatewayMemoryState.events = gatewayMemoryState.events.filter((event) =>
      retainedThreads.has(eventKey(event.hostId, event.threadId)),
    );
  },
};

function recordPrunedEvents(events: GatewayEvent[]) {
  if (events.length === 0) return;
  const next = { ...gatewayMemoryState.eventPrunedThroughByThread };
  for (const event of events) {
    const key = eventKey(event.hostId, event.threadId);
    next[key] = Math.max(next[key] ?? 0, event.id);
  }
  gatewayMemoryState.eventPrunedThroughByThread = next;
}

function eventKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

function hostIdFromEventKey(key: string) {
  return Number(key.slice(0, key.indexOf(":")));
}
