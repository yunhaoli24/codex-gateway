import type { HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
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

export class ThreadOpenService {
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
      return this.snapshotResult(host, threadId, projectId, cachedSnapshot);
    }

    const controller = await this.registry.getController(host, threadId);
    const connectedSnapshot = controller.getOpenSnapshot();
    if (connectedSnapshot) {
      return this.snapshotResult(host, threadId, projectId, connectedSnapshot);
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

function resolveProjectId(hostId: number, projectId: number | null, cwd: unknown) {
  if (projectId || typeof cwd !== "string" || !cwd.trim()) {
    return projectId;
  }
  return projectStore.ensureForPath(hostId, cwd).id;
}
