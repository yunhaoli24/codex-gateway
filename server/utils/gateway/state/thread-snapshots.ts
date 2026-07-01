import type { ThreadOpenSnapshot } from "../runtime/types";
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
    return (
      (gatewayMemoryState.threadSnapshots.find(
        (record) => record.hostId === hostId && record.threadId === threadId,
      )?.snapshot as ThreadOpenSnapshot | undefined) ?? null
    );
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
