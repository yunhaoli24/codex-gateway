import { itemId } from "./item-identity";
import { mergeThreadItem } from "./item-merge";
import type { ThreadHistoryItem } from "./types";

/** Disclosures read ascending from the start of one Turn. This gives each page an unambiguous
 * boundary even when retention left only user messages and a final answer. Do not infer ordering
 * from request/event arrival times: live items can arrive while the persisted page is being read. */
export function mergeTurnItemPage(
  existing: ThreadHistoryItem[],
  page: ThreadHistoryItem[],
  pageEndId: string | undefined,
) {
  const boundary =
    pageEndId === undefined ? -1 : existing.findIndex((item) => itemId(item) === pageEndId);
  if (pageEndId !== undefined && boundary < 0) return null;
  return insertItemPage(existing, page, boundary + 1);
}

/** Timeline pagination and a Turn disclosure can cover disjoint ranges. The official position
 * locates a page among retained transcript items without guessing from timestamps or item IDs.
 * The ascending disclosure prefix is already complete, including items without timeline positions.
 * Other unpositioned notifications keep their relative order: missing position does not mean an
 * item is new, because the initial snapshot can also retain older notifications. */
export function mergeEarlierTimelineItems(
  existing: ThreadHistoryItem[],
  page: ThreadHistoryItem[],
  pageEndId: string | undefined,
) {
  const result = [...existing];
  for (const incoming of page) {
    const index = result.findIndex((item) => itemId(item) === itemId(incoming));
    if (index >= 0) {
      result[index] = mergeThreadItem(incoming, result[index]!);
      continue;
    }
    const position = incoming.timelinePosition;
    if (position === undefined) throw new Error("An older timeline item must have a position");
    const prefixEnd =
      pageEndId === undefined ? -1 : result.findIndex((item) => itemId(item) === pageEndId);
    const nextAnchor = result.findIndex(
      (item, offset) =>
        offset > prefixEnd &&
        item.timelinePosition !== undefined &&
        item.timelinePosition > position,
    );
    const previousAnchor = result.findLastIndex(
      (item) => item.timelinePosition !== undefined && item.timelinePosition < position,
    );
    const insertion =
      nextAnchor >= 0
        ? nextAnchor
        : previousAnchor >= 0 || prefixEnd >= 0
          ? Math.max(previousAnchor, prefixEnd) + 1
          : result.length;
    result.splice(insertion, 0, incoming);
  }
  return result;
}

function insertItemPage(
  existing: ThreadHistoryItem[],
  page: ThreadHistoryItem[],
  insertion: number,
) {
  if (page.length === 0) return existing;
  const pageIds = new Set(page.map(itemId));
  const existingById = new Map(existing.map((item) => [itemId(item), item]));
  const outsidePage = (item: ThreadHistoryItem) => !pageIds.has(itemId(item));
  const hydrated = page.map((item) => {
    const current = existingById.get(itemId(item));
    return current === undefined ? item : mergeThreadItem(item, current);
  });
  return [
    ...existing.slice(0, insertion).filter(outsidePage),
    ...hydrated,
    ...existing.slice(insertion).filter(outsidePage),
  ];
}
