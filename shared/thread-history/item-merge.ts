import { mergeFileChanges } from "./file-changes";
import { sameItem } from "./item-identity";

export function mergeTurnItems(existingItems: any[], incomingItems: any[]) {
  const nextItems = [...existingItems];
  for (const incoming of incomingItems) {
    const index = nextItems.findIndex((candidate) => sameItem(candidate, incoming));
    if (index >= 0) {
      nextItems[index] = mergeThreadItem(nextItems[index], incoming);
    } else {
      nextItems.push(incoming);
    }
  }
  return nextItems;
}

export function mergeThreadItem(existing: any, incoming: any) {
  const merged = { ...existing, ...incoming };
  if (existing?.type === "fileChange" || incoming?.type === "fileChange") {
    merged.changes = mergeFileChanges(existing?.changes, incoming?.changes);
  }
  return merged;
}
