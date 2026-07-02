import type { HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { runtimeStatusFromSnapshotState } from "~~/shared/thread-runtime-status";
import { gatewayEventStore } from "../state/gateway-events";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { threadBroker } from "./broker";
import { runtimeLog } from "./runtime-log";

export const RUNNING_THREAD_STALE_MS = 90_000;

interface RefreshRunningThreadsInput {
  host: HostRecord;
  reason: "host-connected" | "stale-scan";
  staleOnly?: boolean;
  staleMs?: number;
}

export async function refreshRunningThreadsForHost({
  host,
  reason,
  staleOnly = false,
  staleMs = RUNNING_THREAD_STALE_MS,
}: RefreshRunningThreadsInput) {
  const candidates = runningThreadCandidates(host.id, {
    staleOnly,
    staleMs,
  });
  if (!candidates.length) {
    return { refreshed: 0, failed: 0 };
  }

  runtimeLog("refreshing running thread states", {
    hostId: host.id,
    reason,
    count: candidates.length,
  });

  let refreshed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      await threadBroker.refreshThreadState(
        host,
        candidate.threadId,
        candidate.projectId,
        INITIAL_TURN_PAGE_LIMIT,
      );
      refreshed += 1;
    } catch (error) {
      failed += 1;
      runtimeLog("running thread state refresh failed", {
        hostId: host.id,
        threadId: candidate.threadId,
        reason,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  runtimeLog("refreshed running thread states", {
    hostId: host.id,
    reason,
    refreshed,
    failed,
  });
  return { refreshed, failed };
}

function runningThreadCandidates(hostId: number, options: { staleOnly: boolean; staleMs: number }) {
  const now = Date.now();
  return threadSnapshotStore
    .listForHost(hostId)
    .map((record) => {
      return {
        threadId: record.threadId,
        projectId: record.snapshot.projectId ?? null,
        runtimeStatus: runtimeStatusFromSnapshotState(
          record.snapshot.thread,
          record.snapshot.history,
        ),
        latestActivityAt: latestActivityAt(hostId, record.threadId, record.updatedAt),
      };
    })
    .filter((candidate) => {
      if (candidate.runtimeStatus !== "running") {
        return false;
      }
      if (!options.staleOnly) {
        return true;
      }
      return now - candidate.latestActivityAt >= options.staleMs;
    });
}

function latestActivityAt(hostId: number, threadId: string, snapshotUpdatedAt: string) {
  const eventCreatedAt = gatewayEventStore.latest(hostId, threadId)?.createdAt;
  const parsed = Date.parse(eventCreatedAt ?? snapshotUpdatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}
