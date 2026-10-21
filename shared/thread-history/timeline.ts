import {
  threadTimelineItemTypes,
  type ThreadHistoryItem,
  type ThreadHistoryTurn,
  type ThreadHistoryState,
  type ThreadTimelineHistoryState,
  type ThreadTimelineItem,
  type ThreadTimelineItemType,
  type ThreadTimelineTurn,
} from "./types";

const timelineItemTypes = new Set<string>(threadTimelineItemTypes);

export function isThreadTimelineItemType(value: unknown): value is ThreadTimelineItemType {
  return typeof value === "string" && timelineItemTypes.has(value);
}

export function asThreadTimelineItem(item: ThreadHistoryItem): ThreadTimelineItem | null {
  return isThreadTimelineItem(item) ? item : null;
}

function isThreadTimelineItem(item: ThreadHistoryItem): item is ThreadTimelineItem {
  return isThreadTimelineItemType(item.type);
}

/**
 * The timeline only accepts typed rows. Unknown future protocol items remain in the history store,
 * but are deliberately excluded here until a presenter is registered for them.
 */
export function asThreadTimelineTurn(turn: ThreadHistoryTurn): ThreadTimelineTurn | null {
  if (typeof turn.id !== "string") return null;
  return {
    ...turn,
    id: turn.id,
    items: (turn.items ?? []).flatMap((item) => {
      const timelineItem = asThreadTimelineItem(item);
      return timelineItem ? [timelineItem] : [];
    }),
  };
}

/**
 * Projects an app-server/Gateway reducer snapshot once at its transport or event boundary.
 * Components must consume the projected array stored in Pinia instead of calling this during
 * setup: thread switches remount the Agent workspace and would otherwise rescan every item even
 * though the cached history object did not change.
 */
export function projectThreadTimelineHistory(
  history: ThreadHistoryState,
  previous?: ThreadTimelineHistoryState,
): ThreadTimelineHistoryState {
  if (history === previous) return previous;
  // Reducers replace only changed Turns. Reuse the previous typed rows by identity rather than
  // filtering all item arrays again for each token; raw App Server pages still use full projection.
  const previousTurns = new Map<ThreadHistoryTurn, ThreadTimelineTurn>(
    previous?.thread.turns.map((turn) => [turn, turn]),
  );
  return {
    thread: {
      id: history.thread.id,
      turns: history.thread.turns.flatMap((turn) => {
        const projected = previousTurns.get(turn);
        if (projected !== undefined) return [projected];
        const timelineTurn = asThreadTimelineTurn(turn);
        return timelineTurn === null ? [] : [timelineTurn];
      }),
    },
  };
}
