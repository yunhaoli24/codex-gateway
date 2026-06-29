let fileChangeSequence = 0;

export function tagFileChanges(changes: unknown) {
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes.map((change) =>
    change && typeof change === "object"
      ? { ...(change as Record<string, unknown>), sequence: ++fileChangeSequence }
      : change,
  );
}
