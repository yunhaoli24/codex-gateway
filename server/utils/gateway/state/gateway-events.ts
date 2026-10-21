import { randomUUID } from "node:crypto";
import type { GatewayEvent } from "~~/shared/types";
import type { AgentEvent } from "~~/shared/agent/events";
import { SERVER_THREAD_CACHE_IDLE_MS } from "~~/shared/config";
import { commandOutputWindow } from "~~/shared/thread-history/retention";
import { currentGatewayMemoryState } from "./memory";
import { UserThreadCache } from "./user-thread-cache";

const MAX_REPLAY_EVENTS = 500;

interface ThreadReplay {
  events: GatewayEvent[];
  prunedThrough: number;
}

// Every delta used to scan/filter/sort all of a user's events. Appending now touches only this
// conversation's bounded, already ordered buffer. Idle expiry also releases output payloads and
// prune markers without retaining a permanent tombstone for every previously visited thread.
const replay = new UserThreadCache<ThreadReplay>(SERVER_THREAD_CACHE_IDLE_MS);

export const gatewayEventStore = {
  pruneToHosts(hostIds: Set<number>) {
    // This runs inside the config draft. Disposable replay buffers are cleared only by the
    // post-commit Host lifecycle, so failed persistence cannot invalidate live runtime state.
    currentGatewayMemoryState().eventEpochByHost = Object.fromEntries(
      Object.entries(currentGatewayMemoryState().eventEpochByHost).filter(([hostId]) =>
        hostIds.has(Number(hostId)),
      ),
    );
  },

  deleteForHost(hostId: number) {
    replay.deleteForHost(hostId);
    this.rotateHostEpoch(hostId);
  },

  epoch(hostId: number) {
    const epochs = currentGatewayMemoryState().eventEpochByHost;
    const key = String(hostId);
    return (epochs[key] ??= randomUUID());
  },

  rotateHostEpoch(hostId: number) {
    currentGatewayMemoryState().eventEpochByHost[String(hostId)] = randomUUID();
  },

  add(hostId: number, threadId: string, event: AgentEvent, createdAt: string): GatewayEvent {
    // Completed commands can carry their entire cumulative stdout again. Bound it before cache
    // insertion, not only on send, so replay cannot pin the original huge string in memory.
    const item = event.type === "timeline.item.upsert" ? commandOutputWindow(event.item) : null;
    const retainedEvent =
      event.type === "timeline.item.upsert" && item !== null && item !== event.item
        ? { ...event, item }
        : event;
    const gatewayEvent: GatewayEvent = {
      id: currentGatewayMemoryState().nextEventId++,
      hostId,
      threadId,
      event: retainedEvent,
      createdAt,
    };
    // A recreated buffer must also reject cursors from before its first event. Otherwise the
    // first new notification after idle expiry would hide the gap left by the expired buffer.
    const buffer = replay.get(hostId, threadId) ?? {
      events: [],
      prunedThrough: gatewayEvent.id - 1,
    };
    buffer.events.push(gatewayEvent);
    const excess = buffer.events.length - MAX_REPLAY_EVENTS;
    if (excess > 0) {
      buffer.prunedThrough = buffer.events[excess - 1]?.id ?? buffer.prunedThrough;
      buffer.events.splice(0, excess);
    }
    replay.set(hostId, threadId, buffer);
    return gatewayEvent;
  },

  list(hostId: number, threadId: string, afterId = 0, limit = 200): GatewayEvent[] {
    return (
      replay
        .get(hostId, threadId)
        ?.events.filter((event) => event.id > afterId)
        .slice(0, limit) ?? []
    );
  },

  latestId(hostId: number, threadId: string): number {
    return this.latest(hostId, threadId)?.id ?? 0;
  },

  latest(hostId: number, threadId: string): GatewayEvent | null {
    return replay.get(hostId, threadId)?.events.at(-1) ?? null;
  },

  hasReplayGap(hostId: number, threadId: string, afterId: number) {
    if (afterId <= 0) return false;
    const buffer = replay.get(hostId, threadId);
    // Expiry is a replay gap, not a successful empty replay. The existing snapshot activation
    // path restores authoritative Codex data instead of silently skipping expired messages.
    if (buffer === undefined) return true;
    return afterId > (buffer.events.at(-1)?.id ?? 0) || afterId < buffer.prunedThrough;
  },
};
