export function mergeFileChanges(existingChanges: unknown, incomingChanges: unknown) {
  if (!Array.isArray(incomingChanges)) {
    return Array.isArray(existingChanges) ? existingChanges : incomingChanges;
  }
  if (!Array.isArray(existingChanges) || !existingChanges.length) {
    return [...incomingChanges].sort(compareFileChangeOrder);
  }
  const next = [...existingChanges];
  for (const incoming of incomingChanges) {
    const index = next.findIndex((candidate) => sameFileChange(candidate, incoming));
    if (index >= 0) {
      const changed = fileChangeChanged(next[index], incoming);
      next[index] = {
        ...next[index],
        ...incoming,
        sequence: changed ? incoming?.sequence : (next[index]?.sequence ?? incoming?.sequence),
      };
    } else {
      next.push(incoming);
    }
  }
  return next.sort(compareFileChangeOrder);
}

function sameFileChange(left: any, right: any) {
  return fileChangePath(left) === fileChangePath(right);
}

function fileChangeChanged(left: any, right: any) {
  return (
    left?.diff !== right?.diff ||
    JSON.stringify(left?.kind ?? null) !== JSON.stringify(right?.kind ?? null)
  );
}

function fileChangePath(change: any) {
  return String(change?.path || change?.filePath || change?.pathAfter || change?.pathBefore || "");
}

function compareFileChangeOrder(left: any, right: any) {
  const leftSequence = typeof left?.sequence === "number" ? left.sequence : Number.MAX_SAFE_INTEGER;
  const rightSequence =
    typeof right?.sequence === "number" ? right.sequence : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return 0;
}
