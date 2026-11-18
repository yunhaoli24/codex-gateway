import { INITIAL_TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import { commandOutputWindow, threadTranscriptItems } from "~~/shared/thread-history/retention";
import type { ThreadTimelineHistoryState } from "~~/shared/types";

/** A new browser needs the transcript and a small recent tool tail, not the monitor's accumulated
 * working set. Keep this at the browser boundary: trimming after JSON.parse still makes a phone
 * download/allocate every command output first. The authoritative runtime snapshot stays intact. */
export function threadActivationHistory(
  history: ThreadTimelineHistoryState,
  limit = INITIAL_TIMELINE_PAGE_LIMIT,
): ThreadTimelineHistoryState {
  let remaining = limit;
  const turns = history.thread.turns.map((turn) => ({
    turn,
    transcript: threadTranscriptItems(turn),
  }));
  const retained = new Set<
    ThreadTimelineHistoryState["thread"]["turns"][number]["items"][number]
  >();
  for (const { turn, transcript } of turns.toReversed()) {
    for (const item of turn.items.toReversed()) {
      if (transcript.has(item) || item.pendingApproval != null || item.requestId != null) {
        retained.add(item);
      } else if (remaining > 0) {
        retained.add(item);
        remaining -= 1;
      }
    }
  }
  return {
    thread: {
      ...history.thread,
      turns: turns.map(({ turn }) => {
        const items = turn.items
          .filter((item) => retained.has(item))
          .map((item) => commandOutputWindow(item));
        if (items.length === turn.items.length) return { ...turn, items };
        // Reuse the existing disclosure pagination contract. A missing cursor means "read the
        // official first item page on the first click", never fabricate a cursor from an item id or
        // rollout position. Thread-level paging keeps its original official cursor unchanged.
        return {
          ...turn,
          items,
          diff: undefined,
          itemsView: "summary" as const,
          olderItemsCursor: undefined,
          itemsPageEndId: undefined,
        };
      }),
    },
  };
}
