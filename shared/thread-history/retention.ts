import { COMMAND_OUTPUT_CACHE_CHARS, THREAD_INTERMEDIATE_CACHE_TURNS } from "../config";
import type { ThreadHistoryItem, ThreadHistoryState, ThreadHistoryTurn } from "./types";

export function commandOutputWindow<T extends ThreadHistoryItem>(item: T, end?: number): T {
  const output = item.aggregatedOutput;
  if (typeof output !== "string") return item;
  if (output.length <= COMMAND_OUTPUT_CACHE_CHARS && end === undefined) return item;
  const windowEnd = Math.min(output.length, Math.max(0, end ?? output.length));
  const start = Math.max(0, windowEnd - COMMAND_OUTPUT_CACHE_CHARS);
  if (start === 0 && end === undefined) return item;
  return {
    ...item,
    // V8 can represent slice() as a view retaining its huge parent string. Joining these bounded
    // code units materializes an independent tail and preserves UTF-16 (including split emoji).
    aggregatedOutput: output.slice(start, windowEnd).split("").join(""),
    outputTotalLength:
      end === undefined
        ? (item.outputTotalLength ?? COMMAND_OUTPUT_CACHE_CHARS) +
          output.length -
          COMMAND_OUTPUT_CACHE_CHARS
        : output.length,
    outputWindowEnd:
      end === undefined
        ? (item.outputTotalLength ?? COMMAND_OUTPUT_CACHE_CHARS) +
          output.length -
          COMMAND_OUTPUT_CACHE_CHARS
        : windowEnd,
  };
}

/** Old intermediate work is disposable in both the server snapshot and the browser cache. The
 * browser alone exempts its expanded Turn; either side can reload details through official paging.
 * User messages and final answers stay in canonical order. Preserve unchanged Turn identities so
 * streaming updates do not force the server to re-project every historical item. */
export function retainThreadHistory(
  history: ThreadHistoryState | null,
  expandedTurnId?: string,
  previous?: ThreadHistoryState,
): ThreadHistoryState | null {
  if (history === null) return history;
  const previousTurns = new Set(previous?.thread.turns);
  let changed = false;
  const turns = history.thread.turns.map((turn, index) => {
    // Previously retained, unchanged recent Turns already have bounded output. A new token in
    // one Turn must not rescan all commands in the other warm Turns. Older collapsed Turns still
    // pass through eviction, including a Turn that just moved beyond the recent-three boundary.
    if (
      previousTurns.has(turn) &&
      (index >= history.thread.turns.length - THREAD_INTERMEDIATE_CACHE_TURNS ||
        turn.id === expandedTurnId)
    )
      return turn;
    let items = turn.items ?? [];
    for (const [itemIndex, item] of items.entries()) {
      const bounded = commandOutputWindow(item);
      if (bounded === item) continue;
      if (items === turn.items) items = [...items];
      items[itemIndex] = bounded;
    }
    let next = items === turn.items ? turn : { ...turn, items };
    if (
      index < history.thread.turns.length - THREAD_INTERMEDIATE_CACHE_TURNS &&
      turn.status !== "inProgress" &&
      turn.id !== expandedTurnId
    ) {
      const transcript = threadTranscriptItems(next);
      const retained = items.filter(
        (item) => transcript.has(item) || item.pendingApproval != null || item.requestId != null,
      );
      if (retained.length !== items.length || next.diff != null) {
        next = {
          ...next,
          items: retained,
          diff: undefined,
          itemsView: "summary",
          olderItemsCursor: undefined,
        };
      }
    }
    if (next !== turn) changed = true;
    return next;
  });
  return changed ? { thread: { ...history.thread, turns } } : history;
}

export function threadTranscriptItems(turn: ThreadHistoryTurn) {
  const items = turn.items ?? [];
  const final =
    items.findLast((item) => item.type === "agentMessage" && item.phase === "final_answer") ??
    items.findLast((item) => item.type === "agentMessage");
  return new Set(
    items.filter(
      (item) =>
        item.type === "userMessage" ||
        item.type === "threadGoal" ||
        item.type === "plan" ||
        item === final,
    ),
  );
}
