import { CLIENT_THREAD_TURN_CACHE_LIMIT } from "../config";
import type { ThreadHistoryState } from "./types";

export function retainRecentThreadTurns(
  history: ThreadHistoryState | null,
  limit = CLIENT_THREAD_TURN_CACHE_LIMIT,
): ThreadHistoryState | null {
  if (history === null || history.thread.turns.length <= limit) return history;
  // App Server remains the source of truth for evicted pages. Keep only the newest client-side
  // window; fabricating an upstream cursor here would violate its explicitly opaque cursor API.
  return {
    thread: {
      ...history.thread,
      turns: history.thread.turns.slice(-limit),
    },
  };
}
