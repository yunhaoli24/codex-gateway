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
import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import { mergeTurnItems } from "~~/shared/thread-history/item-merge";

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
  let nextSnapshot =
    history === snapshot.history
      ? snapshot
      : {
          ...snapshot,
          history,
          // Codex cursors are opaque. Once eviction changes the opening boundary we cannot derive
          // a replacement cursor locally; refresh one official page on the next activation instead.
          historyTrimmed:
            snapshot.historyTrimmed === true ||
            (reducedHistory?.thread.turns.length ?? 0) > SERVER_TURN_CACHE_LIMIT,
        };
  nextSnapshot = applySnapshotReducer(nextSnapshot, event) ?? nextSnapshot;
  return nextSnapshot;
}

export function preserveCanonicalUserMessagesInOpenSnapshot(
  snapshot: ThreadOpenSnapshot,
  previousSnapshot: ThreadOpenSnapshot | null,
  events: readonly GatewayEvent[],
) {
  if (previousSnapshot !== null) {
    // Persisted timeline pages do not contain unfinished tool/reasoning items. Retain the live
    // working set for the active Turn, while the page wins for every overlapping persisted item.
    // This is a snapshot merge, not replay of stale item/start events over cumulative output.
    const activeTurns = previousSnapshot.history.thread.turns.filter(
      (turn) => turn.status === "inProgress",
    );
    const pageTurns = snapshot.history.thread.turns;
    snapshot = {
      ...snapshot,
      history: retainSnapshotHistory(
        {
          thread: {
            ...snapshot.history.thread,
            turns: [
              ...pageTurns.map((turn) => {
                const active = activeTurns.find((prior) => prior.id === turn.id);
                return active === undefined ||
                  (turn.status !== undefined && turn.status !== "inProgress")
                  ? turn
                  : {
                      ...turn,
                      status: turn.status ?? active.status,
                      items: mergeTurnItems(active.items, turn.items),
                    };
              }),
              ...activeTurns.filter(
                (turn) => !pageTurns.some((candidate) => candidate.id === turn.id),
              ),
            ],
          },
        },
        snapshot.history,
      ),
    };
  }
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
  const knownUserIds = new Set(
    snapshot.history.thread.turns.flatMap((turn) =>
      turn.items.filter((item) => item.type === "userMessage").map((item) => item.id),
    ),
  );
  // The page is authoritative, including text updated by deltas. Replaying an earlier item/start
  // without its deltas regresses that text. Only fill absent user rows omitted by summary pages;
  // ordinary live notifications continue through the controller after this synchronous commit.
  return [...previousMessages, ...retainedMessages].reduce((current, item) => {
    const id = idFromUnknown(item.id);
    if (knownUserIds.has(id)) return current;
    knownUserIds.add(id);
    return applyEventToOpenSnapshot(current, { type: "timeline.item.upsert", item }) ?? current;
  }, snapshot);
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
