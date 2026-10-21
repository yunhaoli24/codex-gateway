import { sameItem } from "~~/shared/thread-history/item-identity";
import type { ThreadTimelineItem } from "~~/shared/types";
import type { ThreadOpenSnapshot } from "./types";
import { retainSnapshotHistory } from "./snapshot-history";

export interface RecoveredTurnTail {
  turnId: string;
  olderUserItems: ThreadTimelineItem[];
  tailItems: ThreadTimelineItem[];
  complete: boolean;
}

export function installRecoveredTurnTail(
  snapshot: ThreadOpenSnapshot,
  recovery: RecoveredTurnTail,
): ThreadOpenSnapshot {
  return {
    ...snapshot,
    history: retainSnapshotHistory(
      {
        thread: {
          ...snapshot.history.thread,
          turns: snapshot.history.thread.turns.map((turn) => {
            if (String(turn.id) !== recovery.turnId) return turn;
            const existingItems = Array.isArray(turn.items) ? turn.items : [];
            const retainedUsers = existingItems.filter((item) => item.type === "userMessage");
            if (recovery.complete) {
              return {
                ...turn,
                items: mergeOrderedItems(retainedUsers, recovery.tailItems),
                itemsView: "full" as const,
              };
            }

            // A bounded latest tail is authoritative for recent progress, while summary pages retain
            // only the first prompt and final answer. Keep every recovered/submitted user row before
            // that tail so a subscription gap cannot make Desktop-originated steer disappear. We do
            // not label this partial projection as full: opening intermediate history may still page
            // the complete Turn from App Server.
            const finalAgent = [...existingItems]
              .reverse()
              .find((item) => item.type === "agentMessage" && item.phase === "final_answer");
            const items = mergeOrderedItems(
              [...retainedUsers, ...recovery.olderUserItems],
              recovery.tailItems,
              finalAgent === undefined ? [] : [finalAgent],
            );
            return { ...turn, items, itemsView: "summary" as const };
          }),
        },
      },
      snapshot.history,
    ),
  };
}

function mergeOrderedItems(...groups: ThreadTimelineItem[][]) {
  const items: ThreadTimelineItem[] = [];
  for (const incoming of groups.flat()) {
    const index = items.findIndex((candidate) => sameItem(candidate, incoming));
    if (index < 0) {
      items.push(incoming);
      continue;
    }
    items[index] = incoming;
  }
  return items;
}
