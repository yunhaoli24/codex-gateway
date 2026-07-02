import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT, SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import {
  runtimeStatusFromSnapshotState,
  runtimeStatusFromThreadState,
} from "~~/shared/thread-runtime-status";
import { randomUUID } from "node:crypto";
import type {
  ServerRequestResponseInput,
  ThreadOpenSnapshot,
  TurnsPage,
  TurnStartInput,
  TurnSteerInput,
} from "./types";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";
import { ControllerRegistry } from "./controller-registry";
import {
  buildTurnStartParams,
  buildUserInput,
  extractThreadSettings,
  latestTokenUsageFromEvents,
} from "../protocol/thread-payload";
import { gatewayEventStore } from "../state/gateway-events";
import { projectStore } from "../state/projects";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { runtimeLog } from "./runtime-log";
import { threadRuntimeEvents } from "./thread-runtime-events";

class ThreadBroker {
  private readonly registry = new ControllerRegistry();

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
      return this.openSnapshotResult(host, threadId, projectId, cachedSnapshot);
    }

    const controller = await this.registry.getController(host, threadId);
    const connectedSnapshot = controller.getOpenSnapshot();
    if (connectedSnapshot) {
      return this.openSnapshotResult(host, threadId, projectId, connectedSnapshot);
    }

    runtimeLog("thread cache miss", {
      hostId: host.id,
      threadId,
      limit,
    });
    return this.refreshThreadState(host, threadId, projectId, limit);
  }

  private openSnapshotResult(
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

  async startThread(host: HostRecord, params: Record<string, unknown>, projectId: number | null) {
    const client = await this.registry.getHostClient(host);
    const result = await client.request<any>("thread/start", params);
    const thread = {
      ...(result.thread ?? result),
      cwd: (result.thread ?? result)?.cwd ?? params.cwd ?? null,
    };

    threadMetadataStore.record(host.id, projectId, thread);
    const threadId = String(thread.id);
    const controller = await this.registry.attachStartedThread(host, threadId, client);
    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const history = { thread: { ...thread, turns: thread.turns ?? [] } };
    const turnsPage = {
      nextCursor: null,
      backwardsCursor: null,
    };

    controller.setOpenSnapshot({
      thread,
      history,
      projectId,
      turnsPage,
      threadSettings: extractThreadSettings(result),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    });

    return {
      thread,
      history,
      runtimeStatus: runtimeStatusFromThreadState(thread, history, recentEvents) ?? "running",
      threadSettings: extractThreadSettings(result),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
      turnsPage,
      recentEvents,
    };
  }

  async startTurn(host: HostRecord, threadId: string, input: TurnStartInput) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    const clientUserMessageId = input.clientUserMessageId || `gateway-${randomUUID()}`;
    return controller.enqueue(() =>
      controller.client.request<any>(
        "turn/start",
        buildTurnStartParams(threadId, clientUserMessageId, input),
      ),
    );
  }

  async steerTurn(host: HostRecord, threadId: string, input: TurnSteerInput) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    const clientUserMessageId = input.clientUserMessageId || `gateway-steer-${randomUUID()}`;
    return controller
      .enqueue(() =>
        controller.client.request<{ turnId?: string }>("turn/steer", {
          threadId,
          expectedTurnId: input.expectedTurnId,
          clientUserMessageId,
          input: buildUserInput(input),
        }),
      )
      .catch(async (error) => {
        if (isNoActiveTurnToSteer(error)) {
          runtimeLog("refreshing thread after stale steer state", {
            hostId: host.id,
            threadId,
            expectedTurnId: input.expectedTurnId,
          });
          await this.refreshThreadState(host, threadId, null, INITIAL_TURN_PAGE_LIMIT);
        }
        throw error;
      });
  }

  async interruptTurn(host: HostRecord, threadId: string, turnId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    return controller.enqueue(() =>
      controller.client.request<Record<string, never>>("turn/interrupt", {
        threadId,
        turnId,
      }),
    );
  }

  async respondToServerRequest(
    host: HostRecord,
    threadId: string,
    input: ServerRequestResponseInput,
  ) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureConnected();
    if (input.error) {
      controller.client.respondError(
        input.requestId,
        input.error.code,
        input.error.message,
        input.error.data,
      );
    } else {
      controller.client.respond(input.requestId, input.result ?? {});
    }
  }

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    const params: Record<string, unknown> = { threadId };
    if ("model" in input) params.model = input.model;
    if ("effort" in input) params.effort = input.effort;
    if ("approvalPolicy" in input) params.approvalPolicy = input.approvalPolicy;
    return controller.enqueue(() => controller.client.request("thread/settings/update", params));
  }

  async listThreads(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("thread/list", params);
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("model/list", params);
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() =>
      controller.client.request("thread/name/set", { threadId, name }),
    );
  }

  async listThreadTurns(
    host: HostRecord,
    threadId: string,
    params: {
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    },
  ) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    const page = await controller.enqueue(() =>
      controller.client.request<TurnsPage>("thread/turns/list", {
        threadId,
        cursor: params.cursor ?? null,
        limit: params.limit ?? DEFAULT_TURN_PAGE_LIMIT,
        sortDirection: params.sortDirection ?? "desc",
        itemsView: "full",
      }),
    );
    return {
      history: this.pageToFullHistory({ id: threadId }, page),
      turnsPage: this.pageCursorState(page),
    };
  }

  async getController(host: HostRecord, threadId: string) {
    return this.registry.getController(host, threadId);
  }

  async getHostClient(host: HostRecord) {
    return this.registry.getHostClient(host);
  }

  controllersForHost(hostId: number) {
    return this.registry.controllersForHost(hostId);
  }

  async ensureUpstreamSubscribed(host: HostRecord, threadId: string) {
    const controller = await this.registry.getController(host, threadId);
    if (!controller.isSubscribed()) {
      await controller.ensureSubscribed();
    }
  }

  close(hostId: number, threadId: string) {
    this.registry.close(hostId, threadId);
  }

  closeHost(hostId: number) {
    this.registry.closeHost(hostId);
  }

  status() {
    return this.registry.status();
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
    const resolvedProjectId = this.resolveProjectId(host.id, projectId, threadRecord?.cwd);
    threadMetadataStore.record(host.id, resolvedProjectId, threadRecord);

    const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
    const baseSnapshot = {
      thread,
      history: this.pageToFullHistory(thread, initialTurnsPage),
      projectId: resolvedProjectId,
      turnsPage: this.pageCursorState(initialTurnsPage),
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    };
    controller.setOpenSnapshot(baseSnapshot);
    return { snapshot: baseSnapshot, resolvedProjectId };
  }

  private resolveProjectId(hostId: number, projectId: number | null, cwd: unknown) {
    if (projectId || typeof cwd !== "string" || !cwd.trim()) {
      return projectId;
    }
    return projectStore.ensureForPath(hostId, cwd).id;
  }

  private pageToFullHistory(thread: any, page: TurnsPage) {
    const turns = [...(page.data ?? [])].reverse().slice(-SERVER_TURN_CACHE_LIMIT);
    return {
      thread: {
        ...thread,
        turns,
      },
    };
  }

  private pageCursorState(page: TurnsPage) {
    return {
      nextCursor: page.nextCursor ?? null,
      backwardsCursor: page.backwardsCursor ?? null,
    };
  }
}

export const threadBroker = new ThreadBroker();

function isNoActiveTurnToSteer(error: unknown) {
  return (
    (error as any)?.rpcMethod === "turn/steer" &&
    String((error as any)?.message ?? "")
      .toLowerCase()
      .includes("no active turn")
  );
}
