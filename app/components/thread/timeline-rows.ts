export type ThreadTimelineRow =
  | { key: string; type: "older" }
  | { key: string; type: "turn"; turn: Record<string, any> }
  | { key: string; type: "error"; message: string };

export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: Record<string, any>[];
  olderTurnsCursor: string | null;
  visibleError: string | null;
}) {
  const rows: ThreadTimelineRow[] = [];
  if (input.threadId && input.olderTurnsCursor) {
    rows.push({ key: "older-turns", type: "older" });
  }
  for (const turn of input.turns) {
    rows.push({
      key: `turn-${turn.id || JSON.stringify(turn).length}`,
      type: "turn",
      turn,
    });
  }
  if (input.visibleError) {
    rows.push({
      key: `error-${input.visibleError}`,
      type: "error",
      message: input.visibleError,
    });
  }
  return rows;
}

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (!row) {
    return 160;
  }
  if (row.type === "older") {
    return 56;
  }
  if (row.type === "error") {
    return 96;
  }
  return 520;
}
