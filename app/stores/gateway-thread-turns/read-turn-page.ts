import { TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import { timelinePagesItemsForTurn } from "~~/shared/thread-history/app-server-timeline";
import { requestThreadTimelinePage } from "./transport";

/** Skip unrelated pages without retaining them. Disclosure reads one target page per click, not
 * an entire long turn. All continuation strings come verbatim from thread/timeline/list. */
export async function readTurnTimelinePage(input: {
  hostId: number;
  threadId: string;
  turnId: string;
  cursor?: string | null;
  sessionIsCurrent: () => boolean;
}) {
  let cursor = input.cursor ?? null;
  const seen = new Set<string>();
  while (input.sessionIsCurrent()) {
    const page = await requestThreadTimelinePage({
      hostId: input.hostId,
      threadId: input.threadId,
      cursor,
      limit: TIMELINE_PAGE_LIMIT,
    });
    const items = timelinePagesItemsForTurn([page], input.turnId);
    const reachedStart = page.data.some(
      (entry) => entry.type === "turnStarted" && entry.turnId === input.turnId,
    );
    if (items.length > 0 || reachedStart) {
      return {
        items,
        nextCursor: reachedStart ? null : page.nextCursor,
        complete: reachedStart || page.nextCursor === null,
      };
    }
    if (page.nextCursor === null) break;
    if (seen.has(page.nextCursor))
      throw new Error("App Server returned a repeated timeline cursor");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error("App Server timeline item is no longer available");
}
