import type { ThreadFileChange } from "./types";

export function mergeFileChanges(existingChanges: unknown, incomingChanges: unknown) {
  if (!Array.isArray(incomingChanges)) {
    return Array.isArray(existingChanges) ? existingChanges : incomingChanges;
  }
  if (!Array.isArray(existingChanges) || !existingChanges.length) {
    return (incomingChanges as ThreadFileChange[]).sort(compareFileChangeOrder);
  }
  const next = [...existingChanges] as ThreadFileChange[];
  for (const incoming of incomingChanges as ThreadFileChange[]) {
    const index = next.findIndex((candidate) => sameFileChange(candidate, incoming));
    if (index >= 0) {
      const existing = next[index];
      if (!existing) {
        continue;
      }
      const changed = fileChangeChanged(existing, incoming);
      next[index] = {
        ...existing,
        ...incoming,
        sequence: changed ? incoming?.sequence : (existing.sequence ?? incoming?.sequence),
      };
    } else {
      next.push(incoming);
    }
  }
  return next.sort(compareFileChangeOrder);
}

function sameFileChange(left: ThreadFileChange, right: ThreadFileChange) {
  return fileChangePath(left) === fileChangePath(right);
}

function fileChangeChanged(left: ThreadFileChange, right: ThreadFileChange) {
  return (
    left?.diff !== right?.diff ||
    JSON.stringify(left?.kind ?? null) !== JSON.stringify(right?.kind ?? null)
  );
}

function fileChangePath(change: ThreadFileChange) {
  return String(change?.path || change?.filePath || change?.pathAfter || change?.pathBefore || "");
}

function compareFileChangeOrder(left: ThreadFileChange, right: ThreadFileChange) {
  const leftSequence = typeof left?.sequence === "number" ? left.sequence : Number.MAX_SAFE_INTEGER;
  const rightSequence =
    typeof right?.sequence === "number" ? right.sequence : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return 0;
}
