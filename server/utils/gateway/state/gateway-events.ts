import { randomUUID } from "node:crypto";
import type { GatewayEvent } from "~~/shared/types";
import type { AgentEvent } from "~~/shared/agent/events";
import { SERVER_THREAD_CACHE_IDLE_MS } from "~~/shared/config";
import { commandOutputWindow } from "~~/shared/thread-history/retention";
import { RemoteThreadCache } from "./remote-thread-cache";
import { remoteHosts } from "./remote-hosts";

// One process-wide sequence is required now that the same remote stream is projected into
// different users' host IDs. Per-user counters could otherwise assign the same id to new events.
let nextEventId = Date.now() * 1_000;
const eventEpoch = randomUUID();
type RemoteEvent = Omit<GatewayEvent, "hostId">;

const MAX_REPLAY_EVENTS = 500;

interface ThreadReplay {
  events: RemoteEvent[];
  prunedThrough: number;
}

// Every delta used to scan/filter/sort all of a user's events. Appending now touches only this
// conversation's bounded, already ordered buffer. Idle expiry also releases output payloads and
// prune markers without retaining a permanent tombstone for every previously visited thread.
const replay = new RemoteThreadCache<ThreadReplay>(SERVER_THREAD_CACHE_IDLE_MS);

export const gatewayEventStore = {
  deleteForRemote(remoteKey: string) {
    replay.deleteForRemote(remoteKey);
  },

  epoch(hostId: number) {
    // Include the authenticated remote identity so changing a Host cannot reuse a previous
    // machine's cursor. Missing/expired replay is handled separately by hasReplayGap.
    return `${eventEpoch}:${remoteHosts.key(hostId) ?? "disconnected"}`;
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
      id: nextEventId++,
      hostId,
      threadId,
      event: retainedEvent,
      createdAt,
    };
    // A failed authentication has no shared remote namespace. Its diagnostic is delivered only
    // to the requesting user's live listener and must not create a remotely readable cache entry.
    if (remoteHosts.key(hostId) === null) return gatewayEvent;
    // A recreated buffer must also reject cursors from before its first event. Otherwise the
    // first new notification after idle expiry would hide the gap left by the expired buffer.
    const buffer = replay.get(hostId, threadId) ?? {
      events: [],
      prunedThrough: gatewayEvent.id - 1,
    };
    buffer.events.push({
      id: gatewayEvent.id,
      threadId,
      event: gatewayEvent.event,
      createdAt,
    });
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
        .slice(0, limit)
        .map((event) => ({ ...event, hostId })) ?? []
    );
  },

  latestId(hostId: number, threadId: string): number {
    return this.latest(hostId, threadId)?.id ?? 0;
  },

  latest(hostId: number, threadId: string): GatewayEvent | null {
    const event = replay.get(hostId, threadId)?.events.at(-1);
    return event === undefined ? null : { ...event, hostId };
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
