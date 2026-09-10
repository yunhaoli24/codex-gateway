import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import type { ThreadHistoryState, ThreadTimelineHistoryState } from "~~/shared/types";
import {
  appServerThreadStatusFromUnknown,
  threadSettingsFromAppServer,
} from "~~/shared/runtime/app-server";
import { idFromUnknown } from "~~/shared/utils/records";
import type { AgentEvent } from "~~/shared/agent/events";
import { applyCanonicalEventToHistory } from "~~/shared/thread-history/canonical-events";
import type { ThreadOpenSnapshot } from "./types";

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
  const history = projectThreadTimelineHistory(
    trimSnapshotHistory(reducedHistory ?? snapshot.history),
  );
  let nextSnapshot = withSnapshotHistory(snapshot, history);
  nextSnapshot = applySnapshotReducer(nextSnapshot, event) ?? nextSnapshot;
  return nextSnapshot;
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
    case "thread.realtime.error":
    case "thread.started":
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

function trimSnapshotHistory(history: ThreadHistoryState): ThreadHistoryState {
  return {
    ...history,
    thread: {
      ...history.thread,
      turns: history.thread.turns.slice(-SERVER_TURN_CACHE_LIMIT),
    },
  };
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

function withSnapshotHistory(
  snapshot: ThreadOpenSnapshot,
  history: ThreadTimelineHistoryState,
): ThreadOpenSnapshot {
  return {
    ...snapshot,
    history,
  };
}

function snapshotThread(snapshot: ThreadOpenSnapshot) {
  return snapshot.history.thread;
}

function updateSnapshotThreadSettings(snapshot: ThreadOpenSnapshot, value: unknown) {
  const threadSettings = threadSettingsFromAppServer(value);
  return threadSettings === null ? snapshot : { ...snapshot, threadSettings };
}
