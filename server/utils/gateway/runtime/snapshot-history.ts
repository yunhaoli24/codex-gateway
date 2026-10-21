import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import { retainThreadHistory } from "~~/shared/thread-history/retention";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import type { ThreadHistoryState, ThreadTimelineHistoryState } from "~~/shared/types";

/** Apply retention at App Server page/event boundaries, before the snapshot becomes a cache root.
 * Browser-only trimming leaves the monitor retaining every command from up to 50 Turns forever.
 * Keep the same transcript/recent-work policy on both sides; discarded details remain in Codex and
 * reload via its opaque timeline cursor, not a second Gateway history or custom eviction protocol. */
export function retainSnapshotHistory(
  history: ThreadHistoryState,
  previous?: ThreadTimelineHistoryState,
): ThreadTimelineHistoryState {
  const limited =
    history.thread.turns.length <= SERVER_TURN_CACHE_LIMIT
      ? history
      : {
          ...history,
          thread: {
            ...history.thread,
            turns: history.thread.turns.slice(-SERVER_TURN_CACHE_LIMIT),
          },
        };
  return projectThreadTimelineHistory(retainThreadHistory(limited) ?? limited, previous);
}
