import type { AppServerTimelineEntry, AppServerTimelinePage } from "../runtime/app-server";
import type { ThreadHistoryTurn } from "./types";
import { asThreadTimelineItem } from "./timeline";

export function timelinePageToTurns(page: AppServerTimelinePage): ThreadHistoryTurn[] {
  const turns = new Map<string, ThreadHistoryTurn>();
  for (const entry of [...page.data].sort((left, right) => left.position - right.position)) {
    if (entry.type === "realtime") continue;
    const turn = timelineEntryTurn(turns, entry);
    if (turn !== null) turns.set(entry.turnId, turn);
  }
  for (const turn of turns.values()) {
    const hasStart = page.data.some(
      (entry) => entry.type === "turnStarted" && entry.turnId === turn.id,
    );
    const hasCompletion = page.data.some(
      (entry) => entry.type === "turnCompleted" && entry.turnId === turn.id,
    );
    if (hasStart && hasCompletion) turn.itemsView = "full";
  }
  return [...turns.values()];
}

export function timelinePageItemsForTurn(page: AppServerTimelinePage, turnId: string) {
  return page.data.flatMap((entry) => {
    if (entry.type !== "item" || entry.turnId !== turnId) return [];
    const item = asThreadTimelineItem({
      ...entry.item,
      turnId,
      timelinePosition: entry.position,
    });
    return item === null ? [] : [item];
  });
}

function timelineEntryTurn(
  turns: Map<string, ThreadHistoryTurn>,
  entry: AppServerTimelineEntry,
): ThreadHistoryTurn | null {
  if (entry.type === "realtime") return null;
  const existing = turns.get(entry.turnId);
  const turn = existing ?? { id: entry.turnId, items: [], itemsView: "summary" as const };
  if (entry.type === "item") {
    const item = asThreadTimelineItem({
      ...entry.item,
      turnId: entry.turnId,
      timelinePosition: entry.position,
    });
    if (item !== null) turn.items = [...(turn.items ?? []), item];
    return turn;
  }
  if (entry.type === "turnStarted") {
    return { ...turn, status: "inProgress", startedAt: entry.startedAt };
  }
  return {
    ...turn,
    status: entry.status,
    completedAt: entry.completedAt,
    startedAt: entry.startedAt,
    durationMs: entry.durationMs,
  };
}
