export type ThreadTimelineRow =
  | { canAnchorPrepend: boolean; key: string; type: "older" }
  | { canAnchorPrepend: boolean; key: string; type: "turn"; turn: ThreadTimelineTurn }
  | { canAnchorPrepend: boolean; key: string; type: "error"; message: string };

export type ThreadTimelineTurn = Record<string, any> & {
  id: string;
};

export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: ThreadTimelineTurn[];
  olderTurnsCursor: string | null;
  visibleError: string | null;
}) {
  const rows: ThreadTimelineRow[] = [];
  if (input.threadId && input.olderTurnsCursor) {
    rows.push({ canAnchorPrepend: false, key: `${input.threadId}:older-turns`, type: "older" });
  }
  for (const turn of input.turns) {
    rows.push({
      canAnchorPrepend: true,
      key: `${input.threadId}:turn-${turn.id}`,
      type: "turn",
      turn,
    });
  }
  if (input.visibleError) {
    rows.push({
      canAnchorPrepend: true,
      key: `${input.threadId}:error-${input.visibleError}`,
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
