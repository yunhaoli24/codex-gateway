export type ThreadTimelineRow =
  | { canAnchorPrepend: boolean; key: string; type: "older" }
  | { canAnchorPrepend: boolean; key: string; type: "turn"; turn: ThreadTimelineTurn };

export type ThreadTimelineTurn = Record<string, any> & {
  id: string;
};

export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: ThreadTimelineTurn[];
  olderTurnsCursor: string | null;
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
  return rows;
}

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (!row) {
    return 160;
  }
  if (row.type === "older") {
    return 56;
  }
  return 520;
}
