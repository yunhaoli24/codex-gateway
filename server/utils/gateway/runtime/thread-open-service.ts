import type { AppServerThread, HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import {
  runtimeStatusFromSnapshotState,
  runtimeStatusFromThreadState,
} from "~~/shared/thread-runtime-status";
import {
  extractThreadSettings,
  latestThreadSettingsFromEvents,
  latestTokenUsageFromEvents,
} from "../protocol/thread-payload";
import { gatewayEventStore } from "../state/gateway-events";
import { projectStore } from "../state/projects";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { ControllerRegistry } from "./controller-registry";
import type { ThreadController } from "./thread-controller";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { runtimeLog } from "./runtime-log";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot, TurnsPage } from "./types";
import { currentGatewayUserId } from "../state/memory";
import { parseThreadReadResult, parseThreadStartResult } from "~~/shared/runtime/app-server";
import { gatewayThreadFromAppServer } from "../protocol/gateway-thread";
import type { ThreadHistoryReader } from "./thread-history-reader";

export class ThreadOpenService {
  private readonly pendingRefreshes = new Map<
    string,
    { limit: number; promise: Promise<ReturnTypeResult> }
  >();

  constructor(
    private readonly registry: ControllerRegistry,
    private readonly historyReader: ThreadHistoryReader,
  ) {}

  async openThread(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
    activationController?: ThreadController,
  ) {
    const cachedSnapshot = threadSnapshotStore.get(host.id, threadId);
    if (cachedSnapshot) {
      if (snapshotSatisfiesTurnLimit(cachedSnapshot, limit)) {
        // Runtime notifications are projected into this snapshot as they arrive, including the
        // active Turn's cumulative output and status. Re-reading a running thread here would make
        // every browser activation call thread/turns/list again. For legacy rollouts app-server
        // must replay the complete JSONL even when the requested page contains only two Turns, so
        // that policy made long conversations slow while their realtime controller was healthy.
        // Only an absent or too-shallow cache requires remote history I/O; reconnect gaps already
        // use the authoritative refresh path explicitly.
        return this.snapshotResult(host, threadId, projectId, cachedSnapshot);
      }
      runtimeLog("thread cache depth refresh", {
        hostId: host.id,
        threadId,
        cachedTurns: threadTurnsFromHistory(cachedSnapshot.history).length,
        requestedTurns: limit,
      });
      return this.refreshThreadState(host, threadId, projectId, limit, activationController);
    }

    runtimeLog("thread cache miss", {
      hostId: host.id,
      threadId,
      limit,
    });
    return this.refreshThreadState(host, threadId, projectId, limit, activationController);
  }

  startedThreadResult(host: HostRecord, projectId: number | null, rawResult: unknown) {
    const parsed = parseThreadStartResult(rawResult);
    const thread: AppServerThread = parsed.thread;
    const threadId = String(thread.id);
    threadMetadataStore.record(host.id, projectId, thread);
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const history = projectThreadTimelineHistory({
      thread: { id: thread.id, turns: thread.turns },
    });
    const turnsPage = {
      nextCursor: null,
      backwardsCursor: null,
    };
    const snapshot = {
      thread,
      history,
      projectId,
      turnsPage,
      threadSettings: extractThreadSettings(parsed.raw),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    threadSnapshotStore.set(host.id, threadId, snapshot);
    return {
      threadId,
      snapshot,
      result: {
        hostId: host.id,
        thread: gatewayThreadFromAppServer(host.id, projectId, thread),
        history,
        lastEventId: gatewayEventStore.latestId(host.id, threadId),
        runtimeStatus: runtimeStatusFromThreadState(thread, history, recentEvents) ?? "running",
        threadSettings: snapshot.threadSettings,
        tokenUsage: snapshot.tokenUsage,
        projectId,
        project: projectId === null ? null : projectStore.get(projectId),
        turnsPage,
        recentEvents: snapshotRecentEvents(),
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
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
    activationController?: ThreadController,
  ): Promise<ReturnTypeResult> {
    const key = refreshKey(host.id, threadId);
    const pending = this.pendingRefreshes.get(key);
    if (pending !== undefined) {
      // A wider cold read may reuse an equal/wider in-flight request, but it must never inherit a
      // narrower one. Wait for the narrow refresh to settle, then retry so the server cache
      // monotonically expands to the requested page depth instead of racing two snapshots into the
      // same store entry.
      if (pending.limit >= limit) return pending.promise;
      await pending.promise;
      return this.refreshThreadState(host, threadId, projectId, limit, activationController);
    }

    const promise = this.performThreadStateRefresh(
      host,
      threadId,
      projectId,
      limit,
      activationController,
    );
    this.pendingRefreshes.set(key, { limit, promise });
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
    threadMetadataStore.record(host.id, null, result.thread);
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
    projectId: number | null,
    limit: number,
    activationController?: ThreadController,
  ) {
    const { snapshot, resolvedProjectId } = await this.loadRemoteOpenSnapshot(
      host,
      threadId,
      projectId,
      limit,
      activationController,
    );
    const status = runtimeStatusFromSnapshotState(snapshot.thread, snapshot.history) ?? "completed";
    // The refresh event is the backend's canonical correction after reconnect
    // or stale running scans; clients must converge on this status.
    threadRuntimeEvents.record(host.id, threadId, { type: "thread.status.changed", status });
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    return {
      thread: gatewayThreadFromAppServer(host.id, resolvedProjectId, snapshot.thread),
      history: snapshot.history,
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      projectId: resolvedProjectId,
      project: resolvedProjectId === null ? null : projectStore.get(resolvedProjectId),
      turnsPage: snapshot.turnsPage,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents: snapshotRecentEvents(),
    };
  }

  private snapshotResult(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    snapshot: ThreadOpenSnapshot,
  ) {
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const resolvedProjectId = snapshot.projectId ?? projectId;
    runtimeLog("thread cache hit", {
      hostId: host.id,
      threadId,
      projectId: resolvedProjectId,
    });
    return {
      thread: gatewayThreadFromAppServer(host.id, resolvedProjectId, snapshot.thread),
      history: snapshot.history,
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      projectId: resolvedProjectId,
      project: resolvedProjectId === null ? null : projectStore.get(resolvedProjectId),
      turnsPage: snapshot.turnsPage,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents: snapshotRecentEvents(),
    };
  }

  private async loadRemoteOpenSnapshot(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit: number,
    activationController?: ThreadController,
  ) {
    if (activationController !== undefined) {
      const resumed = await activationController.resumeWithInitialTurnsPage(limit);
      const initialTurnsPage = resumed.initialTurnsPage;
      if (initialTurnsPage === null || initialTurnsPage === undefined) {
        throw new Error("thread/resume omitted the requested initialTurnsPage");
      }
      const loadedTurnsPage = await this.historyReader.loadInitialTurnsPage(
        host,
        resumed.thread,
        limit,
        initialTurnsPage,
      );
      return this.storeRemoteOpenSnapshot(
        host,
        projectId,
        resumed.thread,
        loadedTurnsPage,
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
    const initialTurnsPage = await this.historyReader.loadInitialTurnsPage(
      host,
      read.thread,
      limit,
    );
    return this.storeRemoteOpenSnapshot(
      host,
      projectId,
      read.thread,
      initialTurnsPage,
      extractThreadSettings(read.thread),
    );
  }

  private storeRemoteOpenSnapshot(
    host: HostRecord,
    projectId: number | null,
    thread: AppServerThread,
    initialTurnsPage: TurnsPage,
    threadSettings: ReturnType<typeof extractThreadSettings> | null,
    activationController?: ThreadController,
  ) {
    const threadId = thread.id;
    const resolvedProjectId = resolveProjectId(host.id, projectId, thread.cwd);
    threadMetadataStore.record(host.id, resolvedProjectId, thread);

    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    // thread/resume does not expose collaborationMode. Preserve the latest complete official
    // thread/settings/updated projection when one exists; otherwise the resume DTO still supplies
    // model and effort for threads that have never changed settings during this Gateway lifetime.
    const effectiveThreadSettings = latestThreadSettingsFromEvents(recentEvents) ?? threadSettings;
    const snapshot = {
      thread,
      history: projectThreadTimelineHistory(pageToFullHistory(thread, initialTurnsPage)),
      projectId: resolvedProjectId,
      turnsPage: pageCursorState(initialTurnsPage),
      threadSettings: effectiveThreadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    // During browser activation the controller is created before the cold snapshot exists. Route
    // the write through it so sub-agent classification and active-main-thread handoff state are
    // initialized together with the cache. Non-browser reconciliation has no activation controller
    // and writes the same canonical snapshot directly.
    if (activationController === undefined) threadSnapshotStore.set(host.id, threadId, snapshot);
    else activationController.setOpenSnapshot(snapshot);
    return { snapshot, resolvedProjectId };
  }
}

type ReturnTypeResult = Awaited<ReturnType<ThreadOpenService["performThreadStateRefresh"]>>;

function snapshotSatisfiesTurnLimit(snapshot: ThreadOpenSnapshot, limit: number) {
  // A cache wider than the caller's first-page preference is still a valid hit. Truncating it
  // would require a different app-server cursor at the new oldest row, and cursors are deliberately
  // opaque; refreshing merely to shrink a valid cache would add SSH/RPC latency. New pages start at
  // INITIAL_TURN_PAGE_LIMIT, while same-page Pinia views ask for the depth they already retained.
  return (
    threadTurnsFromHistory(snapshot.history).length >= limit ||
    snapshot.turnsPage.nextCursor === null
  );
}

function refreshKey(hostId: number, threadId: string) {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Thread refresh requires an authenticated user scope");
  }
  return `${userId}:${hostId}:${threadId}`;
}

function resolveProjectId(hostId: number, projectId: number | null, cwd: unknown) {
  if (projectId !== null || typeof cwd !== "string" || cwd.trim() === "") {
    return projectId;
  }
  return projectStore.ensureForPath(hostId, cwd).id;
}

function snapshotRecentEvents() {
  // Thread snapshots already include materialized history plus lastEventId. Re-sending recent
  // app-server events here duplicates large cumulative diff/output payloads and can push mobile
  // browsers over their renderer memory limit before the realtime subscription starts. New live
  // events are replayed through thread.event after lastEventId, so the snapshot path intentionally
  // keeps this legacy field empty while runtime status/token usage are computed server-side above.
  return [];
}
