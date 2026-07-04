import { mergeFileChanges } from "./file-changes";
import { sameItem } from "./item-identity";
import type { ThreadHistoryItem } from "./types";

export function mergeTurnItems(
  existingItems: ThreadHistoryItem[],
  incomingItems: ThreadHistoryItem[],
) {
  const nextItems = [...existingItems];
  for (const incoming of incomingItems) {
    const index = nextItems.findIndex((candidate) => sameItem(candidate, incoming));
    if (index >= 0) {
      const existing = nextItems[index];
      if (existing) {
        nextItems[index] = mergeThreadItem(existing, incoming);
      }
    } else {
      nextItems.push(incoming);
    }
  }
  return nextItems;
}

export function mergeThreadItem(existing: ThreadHistoryItem, incoming: ThreadHistoryItem) {
  const merged = { ...existing, ...incoming };
  if (existing?.type === "fileChange" || incoming?.type === "fileChange") {
    merged.changes = mergeFileChanges(existing?.changes, incoming?.changes);
  }
  return merged;
}
