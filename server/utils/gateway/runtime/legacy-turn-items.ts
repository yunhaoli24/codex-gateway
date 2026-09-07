import type { HostRecord, ThreadTimelineTurn } from "~~/shared/types";
import { parseThreadReadResult } from "~~/shared/runtime/app-server";
import { asThreadTimelineTurn } from "~~/shared/thread-history/timeline";
import type { CodexRpcClient } from "../infra/rpc/rpc";
import { threadSnapshotStore } from "../state/thread-snapshots";

export async function readLegacyTurnItems(
  client: CodexRpcClient,
  host: HostRecord,
  threadId: string,
  turnId: string,
) {
  // App Server deliberately keeps two history contracts. Legacy threads are materialized through
  // thread/read(includeTurns), while thread/turns/list + thread/items/list are the paginated
  // contract. A live completion notification contains only a summary, so a later disclosure must
  // use the Legacy read API; asking the paginated API for a just-finished Legacy Turn can race the
  // rollout store and report that the Turn is missing. This full replay is intentionally deferred
  // until the reader expands an unloaded Legacy Turn, then retained in the server snapshot.
  const result = await client.request(
    "thread/read",
    { threadId, includeTurns: true },
    120_000,
    parseThreadReadResult,
  );
  const turn = result.thread.turns.find((candidate) => candidate.id === turnId);
  if (turn !== undefined) {
    const projected = asThreadTimelineTurn(turn);
    if (projected === null || projected.itemsView !== "full") {
      throw new Error("App Server did not return full legacy Turn content");
    }
    cacheCompletedTurn(host.id, threadId, projected);
    return projected.items;
  }
  throw new Error("Requested legacy Turn was not found in app-server history");
}

function cacheCompletedTurn(hostId: number, threadId: string, turn: ThreadTimelineTurn) {
  // Do not overwrite an active snapshot with a read that raced streaming deltas. Finished turns
  // are reusable across browsers; update only an already-retained row, leaving page bounds intact.
  if (turn.status !== "completed" && turn.status !== "failed" && turn.status !== "interrupted")
    return;
  threadSnapshotStore.update(hostId, threadId, (snapshot) => {
    if (snapshot === null) return null;
    return {
      ...snapshot,
      history: {
        thread: {
          ...snapshot.history.thread,
          turns: snapshot.history.thread.turns.map((existing) =>
            existing.id === turn.id && existing.status === turn.status
              ? { ...existing, ...turn }
              : existing,
          ),
        },
      },
    };
  });
}
