import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import type { TurnsPage } from "./types";

export function pageToFullHistory(thread: unknown, page: TurnsPage) {
  const turns = [...(page.data ?? [])].reverse().slice(-SERVER_TURN_CACHE_LIMIT);
  return {
    thread: {
      ...(thread && typeof thread === "object" ? thread : { id: "" }),
      turns,
    },
  };
}

export function pageCursorState(page: TurnsPage) {
  return {
    nextCursor: page.nextCursor ?? null,
    backwardsCursor: page.backwardsCursor ?? null,
  };
}
