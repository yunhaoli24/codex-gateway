import { CLIENT_COMMAND_OUTPUT_CHARS, CLIENT_THREAD_INTERMEDIATE_TURNS } from "../config";
import type { ThreadHistoryItem, ThreadHistoryState, ThreadHistoryTurn } from "./types";

export function commandOutputWindow<T extends ThreadHistoryItem>(item: T, end?: number): T {
  const output = item.aggregatedOutput;
  if (typeof output !== "string") return item;
  if (output.length <= CLIENT_COMMAND_OUTPUT_CHARS && end === undefined) return item;
  const windowEnd = Math.min(output.length, Math.max(0, end ?? output.length));
  const start = Math.max(0, windowEnd - CLIENT_COMMAND_OUTPUT_CHARS);
  if (start === 0 && end === undefined) return item;
  return {
    ...item,
    // V8 can represent slice() as a view retaining its huge parent string. Joining these bounded
    // code units materializes an independent tail and preserves UTF-16 (including split emoji).
    aggregatedOutput: output.slice(start, windowEnd).split("").join(""),
    outputTotalLength:
      end === undefined
        ? (item.outputTotalLength ?? CLIENT_COMMAND_OUTPUT_CHARS) +
          output.length -
          CLIENT_COMMAND_OUTPUT_CHARS
        : output.length,
    outputWindowEnd:
      end === undefined
        ? (item.outputTotalLength ?? CLIENT_COMMAND_OUTPUT_CHARS) +
          output.length -
          CLIENT_COMMAND_OUTPUT_CHARS
        : windowEnd,
  };
}

/** Old collapsed intermediate work is disposable. Reuse the existing accordion selection: its
 * contents are already outside the flat virtual list, so no visibility observers, byte estimates,
 * or per-item eviction state are needed. User messages and final answers stay in canonical order. */
export function retainThreadHistory(
  history: ThreadHistoryState | null,
  expandedTurnId?: string,
): ThreadHistoryState | null {
  if (history === null) return history;
  let changed = false;
  const turns = history.thread.turns.map((turn, index) => {
    const items = (turn.items ?? []).map((item) => {
      const bounded = commandOutputWindow(item);
      if (bounded !== item) changed = true;
      return bounded;
    });
    const next = { ...turn, items };
    if (
      index < history.thread.turns.length - CLIENT_THREAD_INTERMEDIATE_TURNS &&
      turn.status !== "inProgress" &&
      turn.id !== expandedTurnId
    ) {
      const transcript = transcriptItems(next);
      const retained = items.filter(
        (item) => transcript.has(item) || item.pendingApproval != null || item.requestId != null,
      );
      if (retained.length !== items.length || next.diff != null) {
        next.items = retained;
        next.diff = undefined;
        next.itemsView = "summary";
        next.olderItemsCursor = undefined;
        changed = true;
      }
    }
    return next;
  });
  return changed ? { thread: { ...history.thread, turns } } : history;
}

function transcriptItems(turn: ThreadHistoryTurn) {
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
