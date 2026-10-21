import type { AppServerThread, HostRecord } from "~~/shared/types";
import type { AppServerTimelinePage } from "~~/shared/runtime/app-server";
import { INITIAL_TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import {
  runtimeStatusFromSnapshotState,
  runtimeStatusFromThreadState,
} from "~~/shared/thread-runtime-status";
import { extractThreadSettings, latestTokenUsageFromEvents } from "../protocol/thread-payload";
import { gatewayEventStore } from "../state/gateway-events";
import { projectStore } from "../state/projects";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { ControllerRegistry } from "./controller-registry";
import type { ThreadController } from "./thread-controller";
import { runtimeLog } from "./runtime-log";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot } from "./types";
import { preserveCanonicalUserMessagesInOpenSnapshot } from "./open-snapshot-events";
import { currentGatewayUserId } from "../state/memory";
import { parseThreadReadResult, parseThreadStartResult } from "~~/shared/runtime/app-server";
import { gatewayThreadFromAppServer } from "../protocol/gateway-thread";
import type { ThreadHistoryReader } from "./thread-history-reader";
import { installRecoveredTurnTail } from "./thread-tail-recovery";
import { timelinePageToTurns } from "~~/shared/thread-history/app-server-timeline";
import { threadActivationHistory } from "../protocol/thread-activation-history";
import { retainSnapshotHistory } from "./snapshot-history";

export class ThreadOpenService {
  private readonly pendingRefreshes = new Map<
    string,
    { limit: number; recoverLatestTail: boolean; promise: Promise<ReturnTypeResult> }
  >();

  constructor(
    private readonly registry: ControllerRegistry,
    private readonly historyReader: ThreadHistoryReader,
  ) {}

  async openThread(
    host: HostRecord,
    threadId: string,
    limit = INITIAL_TIMELINE_PAGE_LIMIT,
    activationController?: ThreadController,
  ) {
    const cachedSnapshot = threadSnapshotStore.get(host.id, threadId);
    if (cachedSnapshot) {
      if (
        activationController !== undefined &&
        !activationController.isSubscribed() &&
        this.isThreadRunning(host.id, threadId)
      ) {
        runtimeLog("thread cache continuity refresh", {
          hostId: host.id,
          threadId,
        });
        return this.refreshThreadState(host, threadId, limit, activationController, true);
      }
      // Runtime notifications are projected into this snapshot as they arrive, including the
      // active Turn's cumulative output and status. Re-reading a running thread here would make
      // every browser activation call repeat the timeline scan. Only an absent cache requires
      // initial history I/O; reconnect gaps use the authoritative refresh path.
      // A timeline page can consist entirely of one running Turn. Cache validity is maintained
      // by the subscription/recovery lifecycle, never by comparing a Turn count with an entry
      // limit. Historical expansion uses its official cursor instead of reopening the thread.
      return this.snapshotResult(host, threadId, cachedSnapshot, limit);
    }

    runtimeLog("thread cache miss", {
      hostId: host.id,
      threadId,
      limit,
    });
    return this.refreshThreadState(host, threadId, limit, activationController);
  }

  startedThreadResult(host: HostRecord, rawResult: unknown) {
    const parsed = parseThreadStartResult(rawResult);
    const thread: AppServerThread = parsed.thread;
    const threadId = String(thread.id);
    threadMetadataStore.record(host.id, thread);
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const history = retainSnapshotHistory({
      thread: { id: thread.id, turns: thread.turns },
    });
    const oldestTimelineCursor = null;
    const snapshot = {
      thread,
      history,
      oldestTimelineCursor,
      threadSettings: extractThreadSettings(parsed.raw),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    threadSnapshotStore.set(host.id, threadId, snapshot);
    return {
      threadId,
      snapshot,
      result: {
        hostId: host.id,
        thread: gatewayThreadFromAppServer(host.id, thread),
        history,
        lastEventId: gatewayEventStore.latestId(host.id, threadId),
        runtimeStatus: runtimeStatusFromThreadState(thread, history, recentEvents) ?? "running",
        threadSettings: snapshot.threadSettings,
        tokenUsage: snapshot.tokenUsage,
        project: projectStore.ensureForPath(host.id, thread.cwd),
        oldestTimelineCursor: null,
        recentEvents: snapshotRecentEvents(host.id, threadId),
      },
    };
  }

  isThreadRunning(hostId: number, threadId: string) {
    const snapshot = threadSnapshotStore.get(hostId, threadId);
    if (snapshot === null) return false;
    const recentEvents = gatewayEventStore.list(hostId, threadId, 0, 200);
    return (
      runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents) === "running"
    );
  }

  async refreshThreadState(
    host: HostRecord,
    threadId: string,
    limit = INITIAL_TIMELINE_PAGE_LIMIT,
    activationController?: ThreadController,
    recoverLatestTail = false,
  ): Promise<ReturnTypeResult> {
    const key = refreshKey(host.id, threadId);
    const pending = this.pendingRefreshes.get(key);
    if (pending !== undefined) {
      // A wider cold read may reuse an equal/wider in-flight request, but it must never inherit a
      // narrower one. Wait for the narrow refresh to settle, then retry so the server cache
      // monotonically expands to the requested page depth instead of racing two snapshots into the
      // same store entry.
      if (pending.limit >= limit && (!recoverLatestTail || pending.recoverLatestTail)) {
        return pending.promise;
      }
      await pending.promise;
      return this.refreshThreadState(
        host,
        threadId,
        limit,
        activationController,
        recoverLatestTail,
      );
    }

    const promise = this.performThreadStateRefresh(
      host,
      threadId,
      limit,
      activationController,
      recoverLatestTail,
    );
    this.pendingRefreshes.set(key, { limit, recoverLatestTail, promise });
    try {
      return await promise;
    } finally {
      if (this.pendingRefreshes.get(key)?.promise === promise) {
        this.pendingRefreshes.delete(key);
      }
    }
  }

  async refreshThreadRuntimeStatus(host: HostRecord, threadId: string) {
    const client = await this.registry.getHostClient(host);
    const result = await client.request(
      "thread/read",
      { threadId, includeTurns: false },
      120_000,
      parseThreadReadResult,
    );
    threadMetadataStore.record(host.id, result.thread);
    const cachedSnapshot = threadSnapshotStore.get(host.id, threadId);
    if (cachedSnapshot !== null) {
      const snapshot = { ...cachedSnapshot, thread: result.thread };
      threadSnapshotStore.set(host.id, threadId, snapshot);
    }
    const status =
      runtimeStatusFromSnapshotState(
        result.thread,
        cachedSnapshot?.history ?? { thread: { id: threadId, turns: [] } },
      ) ?? "completed";
    threadRuntimeEvents.record(host.id, threadId, { type: "thread.status.changed", status });
    return { thread: result.thread, status };
  }

  private async performThreadStateRefresh(
    host: HostRecord,
    threadId: string,
    limit: number,
    activationController?: ThreadController,
    recoverLatestTail = false,
  ) {
    const loaded = await this.loadRemoteOpenSnapshot(host, threadId, activationController, limit);
    let { snapshot } = loaded;
    if (recoverLatestTail) {
      const latestTurn = snapshot.history.thread.turns.at(-1);
      const latestTurnId = latestTurn?.id === undefined ? "" : String(latestTurn.id);
      if (latestTurnId !== "") {
        const recovered = await this.historyReader.recoverLatestTurnTail(
          host,
          threadId,
          latestTurnId,
        );
        snapshot = installRecoveredTurnTail(snapshot, recovered);
        if (activationController === undefined)
          threadSnapshotStore.set(host.id, threadId, snapshot);
        else activationController.setOpenSnapshot(snapshot);
      }
    }
    const status = runtimeStatusFromSnapshotState(snapshot.thread, snapshot.history) ?? "completed";
    // The refresh event is the backend's canonical correction after reconnect
    // or stale running scans; clients must converge on this status.
    threadRuntimeEvents.record(host.id, threadId, { type: "thread.status.changed", status });
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    return {
      thread: gatewayThreadFromAppServer(host.id, snapshot.thread),
      history: threadActivationHistory(snapshot.history, limit),
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      project: projectStore.ensureForPath(host.id, snapshot.thread.cwd),
      oldestTimelineCursor: snapshot.oldestTimelineCursor,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents: snapshotRecentEvents(host.id, threadId),
    };
  }

  private snapshotResult(
    host: HostRecord,
    threadId: string,
    snapshot: ThreadOpenSnapshot,
    limit: number,
  ) {
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    // Thread identity and cwd come directly from Codex. No browser grouping hint can redirect an
    // existing conversation, and a cache hit needs no project-ID repair after a Gateway restart.
    runtimeLog("thread cache hit", {
      hostId: host.id,
      threadId,
    });
    return {
      thread: gatewayThreadFromAppServer(host.id, snapshot.thread),
      history: threadActivationHistory(snapshot.history, limit),
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      project: projectStore.ensureForPath(host.id, snapshot.thread.cwd),
      oldestTimelineCursor: snapshot.oldestTimelineCursor,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents: snapshotRecentEvents(host.id, threadId),
    };
  }

  private async loadRemoteOpenSnapshot(
    host: HostRecord,
    threadId: string,
    activationController?: ThreadController,
    limit = INITIAL_TIMELINE_PAGE_LIMIT,
  ) {
    if (activationController !== undefined) {
      const resumed = await activationController.resumeForHistory();
      const timelinePage = await this.historyReader.loadInitialTimelinePage(
        host,
        resumed.thread,
        limit,
      );
      return this.storeRemoteOpenSnapshot(
        host,
        resumed.thread,
        timelinePage,
        extractThreadSettings(resumed),
        activationController,
      );
    }

    // Non-browser refreshes, such as reconciliation after a failed turn command, already run under
    // a controller operation and must not acquire another subscription lease. They retain the
    // metadata + page pair; normal browser cold opens use the combined resume path above.
    const client = await this.registry.getHostClient(host);
    const read = await client.request(
      "thread/read",
      { threadId, includeTurns: false },
      120_000,
      parseThreadReadResult,
    );
    const timelinePage = await this.historyReader.loadInitialTimelinePage(host, read.thread, limit);
    return this.storeRemoteOpenSnapshot(
      host,
      read.thread,
      timelinePage,
      extractThreadSettings(read.thread),
    );
  }

  private storeRemoteOpenSnapshot(
    host: HostRecord,
    thread: AppServerThread,
    timelinePage: AppServerTimelinePage,
    threadSettings: ReturnType<typeof extractThreadSettings> | null,
    activationController?: ThreadController,
  ) {
    const threadId = thread.id;
    projectStore.ensureForPath(host.id, thread.cwd);
    threadMetadataStore.record(host.id, thread);
    const previousSnapshot = threadSnapshotStore.get(host.id, threadId);
    // The per-thread store retains at most 500 events. Reapply the complete retained window so a
    // summary refresh cannot erase an accepted steer merely because it is older than the first
    // 200 high-frequency output deltas.
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 500);
    const baseSnapshot = {
      thread,
      history: retainSnapshotHistory({
        thread: { id: thread.id, turns: timelinePageToTurns(timelinePage) },
      }),
      oldestTimelineCursor: timelinePage.nextCursor,
      // For browser activation this value comes directly from thread/resume, including its
      // top-level collaborationMode. Do not replace it with a historical settings event: the
      // response is the protocol's persisted thread configuration.
      threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    const snapshot = preserveCanonicalUserMessagesInOpenSnapshot(
      baseSnapshot,
      previousSnapshot,
      recentEvents,
    );
    // During browser activation the controller is created before the cold snapshot exists. Route
    // the write through it so sub-agent classification and active-main-thread handoff state are
    // initialized together with the cache. Non-browser reconciliation has no activation controller
    // and writes the same canonical snapshot directly.
    if (activationController === undefined) threadSnapshotStore.set(host.id, threadId, snapshot);
    else activationController.setOpenSnapshot(snapshot);
    return { snapshot };
  }
}

type ReturnTypeResult = Awaited<ReturnType<ThreadOpenService["performThreadStateRefresh"]>>;

function refreshKey(hostId: number, threadId: string) {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Thread refresh requires an authenticated user scope");
  }
  return `${userId}:${hostId}:${threadId}`;
}

function snapshotRecentEvents(hostId: number, threadId: string) {
  // Summary snapshots intentionally omit later user messages. Replay only those small canonical
  // rows here so a route switch cannot advance the client cursor past a message that the snapshot
  // does not contain. Command output, reasoning, diffs, and token deltas remain on the live stream
  // or explicit item pagination; including those payloads here would recreate the mobile memory
  // pressure this snapshot path was designed to avoid.
  return gatewayEventStore
    .list(hostId, threadId, 0, 500)
    .filter(
      (event) =>
        event.event.type === "timeline.item.upsert" && event.event.item.type === "userMessage",
    );
}
