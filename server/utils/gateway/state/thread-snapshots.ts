import type { ThreadOpenSnapshot } from "../runtime/types";
import { SERVER_THREAD_CACHE_IDLE_MS } from "~~/shared/config";
import { UserThreadCache } from "./user-thread-cache";

const snapshots = new UserThreadCache<ThreadOpenSnapshot>(SERVER_THREAD_CACHE_IDLE_MS);

export const threadSnapshotStore = {
  deleteForHost(hostId: number) {
    snapshots.deleteForHost(hostId);
  },

  get(hostId: number, threadId: string): ThreadOpenSnapshot | null {
    return snapshots.get(hostId, threadId) ?? null;
  },

  listForHost(hostId: number) {
    return snapshots.listForHost(hostId).map(({ hostId, threadId, updatedAt, value }) => ({
      hostId,
      threadId,
      updatedAt,
      snapshot: value,
    }));
  },

  set(hostId: number, threadId: string, snapshot: ThreadOpenSnapshot) {
    snapshots.set(hostId, threadId, snapshot);
  },

  update(
    hostId: number,
    threadId: string,
    updater: (snapshot: ThreadOpenSnapshot | null) => ThreadOpenSnapshot | null,
  ) {
    const previous = this.get(hostId, threadId);
    const next = updater(previous);
    if (next !== null && next !== previous) this.set(hostId, threadId, next);
    return next;
  },
};
