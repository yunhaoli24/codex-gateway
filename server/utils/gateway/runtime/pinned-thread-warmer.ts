import type { HostRecord, PinnedThreadRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { projectStore } from "../state/projects";
import { threadBroker } from "./broker";
import { runtimeLog } from "./runtime-log";

interface WarmPinnedThreadsInput {
  host: HostRecord;
  pinnedThreads: PinnedThreadRecord[];
}

export async function warmPinnedThreads({ host, pinnedThreads }: WarmPinnedThreadsInput) {
  const threads = pinnedThreads.filter((thread) => thread.hostId === host.id);
  if (!threads.length) {
    return;
  }

  runtimeLog("warming pinned threads", {
    hostId: host.id,
    count: threads.length,
  });
  const results = await Promise.allSettled(
    threads.map((thread) =>
      threadBroker.openThread(
        host,
        thread.threadId,
        resolvePinnedProjectId(thread),
        INITIAL_TURN_PAGE_LIMIT,
      ),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  runtimeLog("warmed pinned threads", {
    hostId: host.id,
    count: threads.length,
    failed,
  });
}

function resolvePinnedProjectId(thread: PinnedThreadRecord) {
  if (thread.projectId) {
    return thread.projectId;
  }
  if (thread.subtitle?.trim()) {
    return projectStore.ensureForPath(thread.hostId, thread.subtitle).id;
  }
  return null;
}
