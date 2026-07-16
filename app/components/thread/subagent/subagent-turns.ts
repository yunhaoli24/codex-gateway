import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";

export function subAgentOwnedTurns(
  thread: Record<string, unknown> | null,
  history: unknown,
): ThreadTimelineTurn[] {
  const turns = ((history as any)?.thread?.turns ??
    (history as any)?.turns ??
    []) as ThreadTimelineTurn[];
  const threadCreatedAt = timestampMs(thread?.createdAt);
  if (threadCreatedAt === null) return turns;
  return turns.filter((turn) => {
    const startedAt = timestampMs((turn as any).startedAt);
    // Forked app-server histories include the parent's pre-fork turns. Official
    // Thread.createdAt is the fork boundary; untimestamped turns are retained
    // because the active turn may be emitted before startedAt is populated.
    return startedAt === null || startedAt >= threadCreatedAt;
  });
}

function timestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
