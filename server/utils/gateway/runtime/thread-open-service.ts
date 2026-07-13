import type { HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
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
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { runtimeLog } from "./runtime-log";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot } from "./types";
import { currentGatewayUserId } from "../state/memory";

export class ThreadOpenService {
  private readonly pendingRefreshes = new Map<
    string,
    { limit: number; promise: Promise<ReturnTypeResult> }
  >();

  constructor(private readonly registry: ControllerRegistry) {}

  async openThread(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
  ) {
    const cachedSnapshot = threadSnapshotStore.get(host.id, threadId);
    if (cachedSnapshot) {
      const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
      const cachedStatus = runtimeStatusFromThreadState(
        cachedSnapshot.thread,
        cachedSnapshot.history,
        recentEvents,
      );
      if (cachedStatus === "running") {
        runtimeLog("thread running cache refresh", {
          hostId: host.id,
          threadId,
          projectId,
        });
        return this.refreshThreadState(host, threadId, projectId, limit);
      }
      if (snapshotSatisfiesTurnLimit(cachedSnapshot, limit)) {
        return this.snapshotResult(host, threadId, projectId, cachedSnapshot);
      }
      runtimeLog("thread cache depth refresh", {
        hostId: host.id,
        threadId,
        cachedTurns: threadTurnsFromHistory(cachedSnapshot.history).length,
        requestedTurns: limit,
      });
      return this.refreshThreadState(host, threadId, projectId, limit);
    }

    const controller = await this.registry.getController(host, threadId);
    const connectedSnapshot = controller.getOpenSnapshot();
    if (connectedSnapshot) {
      if (snapshotSatisfiesTurnLimit(connectedSnapshot, limit)) {
        return this.snapshotResult(host, threadId, projectId, connectedSnapshot);
      }
      return this.refreshThreadState(host, threadId, projectId, limit);
    }

    runtimeLog("thread cache miss", {
      hostId: host.id,
      threadId,
      limit,
    });
    return this.refreshThreadState(host, threadId, projectId, limit);
  }

  startedThreadResult(
    host: HostRecord,
    projectId: number | null,
    rawResult: any,
    defaultCwd: unknown,
  ) {
    const thread = {
      ...(rawResult.thread ?? rawResult),
      cwd: (rawResult.thread ?? rawResult)?.cwd ?? defaultCwd ?? null,
    };
    const threadId = String(thread.id);
    threadMetadataStore.record(host.id, projectId, thread);
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const history = { thread: { ...thread, turns: thread.turns ?? [] } };
    const turnsPage = {
      nextCursor: null,
      backwardsCursor: null,
    };
    const snapshot = {
      thread,
      history,
      projectId,
      turnsPage,
      threadSettings: extractThreadSettings(rawResult),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    return {
      threadId,
      snapshot,
      result: {
        hostId: host.id,
        thread,
        history,
        lastEventId: gatewayEventStore.latestId(host.id, threadId),
        runtimeStatus: runtimeStatusFromThreadState(thread, history, recentEvents) ?? "running",
        threadSettings: snapshot.threadSettings,
        tokenUsage: snapshot.tokenUsage,
        projectId,
        project: projectId ? projectStore.get(projectId) : null,
        turnsPage,
        recentEvents,
      },
    };
  }

  async refreshThreadState(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
  ): Promise<ReturnTypeResult> {
    const key = refreshKey(host.id, threadId);
    const pending = this.pendingRefreshes.get(key);
    if (pending) {
      // A wider resume may reuse an equal/wider in-flight request, but it must
      // never inherit a narrower one. Wait for the narrow refresh to settle,
      // then retry so the server cache monotonically expands to the requested
      // page depth instead of racing two snapshots into the same store entry.
      if (pending.limit >= limit) return pending.promise;
      await pending.promise;
      return this.refreshThreadState(host, threadId, projectId, limit);
    }

    const promise = this.performThreadStateRefresh(host, threadId, projectId, limit);
    this.pendingRefreshes.set(key, { limit, promise });
    try {
      return await promise;
    } finally {
      if (this.pendingRefreshes.get(key)?.promise === promise) {
        this.pendingRefreshes.delete(key);
      }
    }
  }

  private async performThreadStateRefresh(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit: number,
  ) {
    const { snapshot, resolvedProjectId } = await this.loadRemoteOpenSnapshot(
      host,
      threadId,
      projectId,
      limit,
    );
    const status = runtimeStatusFromSnapshotState(snapshot.thread, snapshot.history) ?? "completed";
    // The refresh event is the backend's canonical correction after reconnect
    // or stale running scans; clients must converge on this status.
    threadRuntimeEvents.record(host.id, threadId, "thread/status/changed", {
      method: "thread/status/changed",
      params: {
        threadId,
        status,
      },
    });
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    return {
      thread: snapshot.thread,
      history: snapshot.history,
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      projectId: resolvedProjectId,
      project: resolvedProjectId ? projectStore.get(resolvedProjectId) : null,
      turnsPage: snapshot.turnsPage,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents,
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
      thread: snapshot.thread,
      history: snapshot.history,
      runtimeStatus: runtimeStatusFromThreadState(snapshot.thread, snapshot.history, recentEvents),
      projectId: resolvedProjectId,
      project: resolvedProjectId ? projectStore.get(resolvedProjectId) : null,
      turnsPage: snapshot.turnsPage,
      threadSettings: snapshot.threadSettings,
      tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? snapshot.tokenUsage,
      recentEvents,
    };
  }

  private async loadRemoteOpenSnapshot(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit: number,
  ) {
    const controller = await this.registry.getController(host, threadId);
    const resume = await controller.resumeWithInitialTurns(limit);
    const thread = resume.thread ?? resume;
    const initialTurnsPage = resume.initialTurnsPage;
    if (!initialTurnsPage) {
      throw new Error("thread/resume did not return initialTurnsPage");
    }

    const threadRecord = thread.thread ?? thread;
    const resolvedProjectId = resolveProjectId(host.id, projectId, threadRecord?.cwd);
    threadMetadataStore.record(host.id, resolvedProjectId, threadRecord);

    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const snapshot = {
      thread,
      history: pageToFullHistory(thread, initialTurnsPage),
      projectId: resolvedProjectId,
      turnsPage: pageCursorState(initialTurnsPage),
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    controller.setOpenSnapshot(snapshot);
    return { snapshot, resolvedProjectId };
  }
}

type ReturnTypeResult = Awaited<ReturnType<ThreadOpenService["performThreadStateRefresh"]>>;

function snapshotSatisfiesTurnLimit(snapshot: ThreadOpenSnapshot, limit: number) {
  return (
    threadTurnsFromHistory(snapshot.history).length >= limit ||
    snapshot.turnsPage.nextCursor === null
  );
}

function refreshKey(hostId: number, threadId: string) {
  const userId = currentGatewayUserId();
  if (!userId) {
    throw new Error("Thread refresh requires an authenticated user scope");
  }
  return `${userId}:${hostId}:${threadId}`;
}

function resolveProjectId(hostId: number, projectId: number | null, cwd: unknown) {
  if (projectId || typeof cwd !== "string" || !cwd.trim()) {
    return projectId;
  }
  return projectStore.ensureForPath(hostId, cwd).id;
}
