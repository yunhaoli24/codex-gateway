import { TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import { asThreadTimelineItem } from "~~/shared/thread-history/timeline";
import { requestTurnItemsPage } from "./transport";

/** One official item page per disclosure. Its opaque cursor belongs to items/list, never to
 * timeline/list. No scan through unrelated turns and no client-generated ordering keys. */
export async function readTurnItemsPage(input: {
  hostId: number;
  threadId: string;
  turnId: string;
  cursor?: string | null;
}) {
  const page = await requestTurnItemsPage({ ...input, limit: TIMELINE_PAGE_LIMIT });
  const items = page.data.flatMap((entry) => {
    const item = asThreadTimelineItem({
      ...entry.item,
      turnId: entry.turnId,
      startedAtMs: entry.item.startedAtMs ?? entry.startedAtMs,
      completedAtMs: entry.item.completedAtMs ?? entry.completedAtMs,
      outputDeferred: entry.outputDeferred === true,
    });
    return item === null ? [] : [item];
  });
  return { items, nextCursor: page.nextCursor, complete: page.nextCursor === null };
}
