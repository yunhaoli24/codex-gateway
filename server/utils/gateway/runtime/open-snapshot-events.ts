import { normalizeTokenUsage } from "~~/shared/token-usage";
import {
  appServerThreadStatusFromUnknown,
  threadSettingsFromAppServer,
} from "~~/shared/runtime/app-server";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import type { AgentEvent } from "~~/shared/agent/events";
import type { GatewayEvent } from "~~/shared/types";
import { applyCanonicalEventToHistory } from "~~/shared/thread-history/canonical-events";
import type { ThreadOpenSnapshot } from "./types";
import { retainSnapshotHistory } from "./snapshot-history";

export function applyEventToOpenSnapshot(snapshot: ThreadOpenSnapshot | null, event: AgentEvent) {
  if (snapshot === null) {
    return snapshot;
  }

  const eventThreadId = idFromUnknown(snapshotThread(snapshot).id);
  const reducedHistory = applyCanonicalEventToHistory(
    snapshot.history,
    snapshot.thread,
    eventThreadId === null ? "" : String(eventThreadId),
    event,
  );
  // Snapshot history is the backend's materialized timeline cache. Re-project only after an
  // app-server event changed that data; ordinary thread opens then return this cached value without
  // rescanning every item on either side of the transport.
  const history =
    reducedHistory === null || reducedHistory === snapshot.history
      ? snapshot.history
      : retainSnapshotHistory(reducedHistory, snapshot.history);
  let nextSnapshot = history === snapshot.history ? snapshot : { ...snapshot, history };
  nextSnapshot = applySnapshotReducer(nextSnapshot, event) ?? nextSnapshot;
  return nextSnapshot;
}

/**
 * Replays only idempotent materialized events after the official timeline page. Delta events are
 * deliberately excluded because applying a delta twice would duplicate streamed text. The
 * timeline page remains the source of truth for item contents; this reducer only fills the small
 * realtime gap that the page summary cannot contain yet, such as a newly accepted steer.
 */
export function applyMaterializedEventsToOpenSnapshot(
  snapshot: ThreadOpenSnapshot,
  events: readonly GatewayEvent[],
) {
  return events.reduce((current, gatewayEvent) => {
    if (!isMaterializedEvent(gatewayEvent.event)) return current;
    return applyEventToOpenSnapshot(current, gatewayEvent.event) ?? current;
  }, snapshot);
}

export function preserveCanonicalUserMessagesInOpenSnapshot(
  snapshot: ThreadOpenSnapshot,
  previousSnapshot: ThreadOpenSnapshot | null,
  events: readonly GatewayEvent[],
) {
  // App Server's bounded timeline page can omit an earlier user row in a long Turn. Preserve the
  // row already accepted into Gateway's canonical snapshot before replacing that page; doing this
  // once at the snapshot boundary avoids another App Server read and keeps every browser aligned.
  const retainedTurnIds = new Set(snapshot.history.thread.turns.map((turn) => turn.id));
  const previousMessages =
    previousSnapshot?.history.thread.turns.flatMap((turn) =>
      retainedTurnIds.has(turn.id)
        ? turn.items.flatMap((item) =>
            item.type === "userMessage" ? [{ ...item, turnId: turn.id }] : [],
          )
        : [],
    ) ?? [];
  const retainedMessages = events.flatMap((gatewayEvent) => {
    if (gatewayEvent.event.type !== "timeline.item.upsert") return [];
    const item = recordFromUnknown(gatewayEvent.event.item);
    return item?.type === "userMessage" && retainedTurnIds.has(String(item.turnId)) ? [item] : [];
  });
  const withPreviousMessages = [...previousMessages, ...retainedMessages].reduce(
    (current, item) =>
      applyEventToOpenSnapshot(current, { type: "timeline.item.upsert", item }) ?? current,
    snapshot,
  );
  return applyMaterializedEventsToOpenSnapshot(withPreviousMessages, events);
}

function isMaterializedEvent(event: AgentEvent) {
  return event.type !== "timeline.item.delta";
}

function applySnapshotReducer(snapshot: ThreadOpenSnapshot, event: AgentEvent) {
  switch (event.type) {
    case "thread.status.changed":
      return updateSnapshotThreadStatus(snapshot, event.status);
    case "thread.settings.updated":
      return updateSnapshotThreadSettings(snapshot, event.threadSettings);
    case "thread.usage.updated":
      return {
        ...snapshot,
        tokenUsage: normalizeTokenUsage(event.tokenUsage) ?? snapshot.tokenUsage,
      };
    case "error.reported":
    case "gateway.error":
    case "gateway.stderr":
    case "mcp.eventStream.notification":
    case "mcpServer.startupStatus.updated":
    case "notice":
    case "serverRequest.requested":
    case "serverRequest.resolved":
    case "thread.goal.cleared":
    case "thread.goal.updated":
    case "thread.attachment.updated":
    case "thread.realtime.error":
    case "thread.started":
    case "timeline.item.reasoningSummaryPartAdded":
    case "timeline.item.delta":
    case "timeline.item.upsert":
    case "turn.completed":
    case "turn.diff.updated":
    case "turn.plan.updated":
    case "turn.started":
    case "turn.usage.upsert":
      return snapshot;
  }
}

function updateSnapshotThreadStatus(snapshot: ThreadOpenSnapshot, status: unknown) {
  const value = appServerThreadStatusFromUnknown(status);
  if (value === null) {
    return snapshot;
  }
  return {
    ...snapshot,
    thread: {
      ...snapshot.thread,
      status: value,
    },
  };
}

function snapshotThread(snapshot: ThreadOpenSnapshot) {
  return snapshot.history.thread;
}

function updateSnapshotThreadSettings(snapshot: ThreadOpenSnapshot, value: unknown) {
  const threadSettings = threadSettingsFromAppServer(value);
  return threadSettings === null ? snapshot : { ...snapshot, threadSettings };
}
