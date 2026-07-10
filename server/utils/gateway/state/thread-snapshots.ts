import type { ThreadOpenSnapshot } from "../runtime/types";
import { SERVER_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { gatewayMemoryState, nowIso } from "./memory";

export const threadSnapshotStore = {
  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.threadSnapshots = gatewayMemoryState.threadSnapshots.filter((record) =>
      hostIds.has(record.hostId),
    );
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.threadSnapshots = gatewayMemoryState.threadSnapshots.filter(
      (record) => record.hostId !== hostId,
    );
  },

  get(hostId: number, threadId: string): ThreadOpenSnapshot | null {
    const record = gatewayMemoryState.threadSnapshots.find(
      (candidate) => candidate.hostId === hostId && candidate.threadId === threadId,
    );
    if (!record) {
      return null;
    }
    record.updatedAt = nowIso();
    return record.snapshot as ThreadOpenSnapshot;
  },

  listForHost(hostId: number) {
    return gatewayMemoryState.threadSnapshots
      .filter((record) => record.hostId === hostId)
      .map((record) => ({
        ...record,
        snapshot: record.snapshot as ThreadOpenSnapshot,
      }));
  },

  set(hostId: number, threadId: string, snapshot: ThreadOpenSnapshot) {
    const updatedAt = nowIso();
    const index = gatewayMemoryState.threadSnapshots.findIndex(
      (record) => record.hostId === hostId && record.threadId === threadId,
    );
    const record = { hostId, threadId, snapshot, updatedAt };
    if (index >= 0) {
      gatewayMemoryState.threadSnapshots[index] = record;
    } else {
      gatewayMemoryState.threadSnapshots.push(record);
    }
    pruneOldestSnapshots();
  },

  update(
    hostId: number,
    threadId: string,
    updater: (snapshot: ThreadOpenSnapshot | null) => ThreadOpenSnapshot | null,
  ) {
    const nextSnapshot = updater(this.get(hostId, threadId));
    if (nextSnapshot) {
      this.set(hostId, threadId, nextSnapshot);
    }
    return nextSnapshot;
  },
};

function pruneOldestSnapshots() {
  const overflow = gatewayMemoryState.threadSnapshots.length - SERVER_THREAD_CACHE_LIMIT;
  if (overflow <= 0) {
    return;
  }
  const evicted = new Set(
    [...gatewayMemoryState.threadSnapshots]
      .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
      .slice(0, overflow)
      .map((record) => `${record.hostId}:${record.threadId}`),
  );
  gatewayMemoryState.threadSnapshots = gatewayMemoryState.threadSnapshots.filter(
    (record) => !evicted.has(`${record.hostId}:${record.threadId}`),
  );
}
