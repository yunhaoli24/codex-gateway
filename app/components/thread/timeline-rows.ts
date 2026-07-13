export type ThreadTimelineRow = { key: string; type: "turn"; turn: ThreadTimelineTurn };

export type ThreadTimelineTurn = Record<string, any> & {
  id: string;
};

export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: ThreadTimelineTurn[];
}) {
  return input.turns.map(
    (turn) =>
      ({
        key: `${input.threadId}:turn-${turn.id}`,
        type: "turn",
        turn,
      }) satisfies ThreadTimelineRow,
  );
}

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (!row) {
    return 160;
  }
  return 520;
}
