import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import { randomUUID } from "node:crypto";
import type {
  CloseSubscriber,
  ServerRequestResponseInput,
  Subscriber,
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

class ThreadBroker {
  private readonly registry = new ControllerRegistry();

  async openThread(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = DEFAULT_TURN_PAGE_LIMIT,
  ) {
    const controller = await this.registry.getController(host, threadId);
    const activeSnapshot = controller.getOpenSnapshot();
    if (activeSnapshot && this.isFreshUnmaterializedSnapshot(activeSnapshot)) {
      const recentEvents = gatewayEventStore.list(host.id, threadId, 0, 200);
      const resolvedProjectId = activeSnapshot.projectId ?? projectId;
      return {
        thread: activeSnapshot.thread,
        history: activeSnapshot.history,
        projectId: resolvedProjectId,
        project: resolvedProjectId ? projectStore.get(resolvedProjectId) : null,
        turnsPage: activeSnapshot.turnsPage,
        threadSettings: activeSnapshot.threadSettings,
        tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? activeSnapshot.tokenUsage,
        recentEvents,
      };
    }

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
    const history = this.pageToFullHistory(thread, initialTurnsPage);
    const turnsPage = this.pageCursorState(initialTurnsPage);
    controller.setOpenSnapshot({
      thread,
      history,
      projectId: resolvedProjectId,
      turnsPage,
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    });

    return {
      thread,
      history,
      projectId: resolvedProjectId,
      project: resolvedProjectId ? projectStore.get(resolvedProjectId) : null,
      turnsPage,
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
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
    const recentEvents = gatewayEventStore
      .list(host.id, threadId, 0, 200)
      .concat(controller.buffer);
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
    return controller.enqueue(() =>
      controller.client.request<{ turnId?: string }>("turn/steer", {
        threadId,
        expectedTurnId: input.expectedTurnId,
        clientUserMessageId,
        input: buildUserInput(input),
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

  async readThreadStatus(host: HostRecord, threadId: string) {
    const client = await this.registry.getHostClient(host);
    const result = await client.request<any>(
      "thread/read",
      {
        threadId,
        includeTurns: false,
      },
      30_000,
    );
    const thread = result?.thread ?? result;
    return {
      thread,
      status: thread?.status ?? result?.status ?? null,
    };
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

  async subscribe(
    host: HostRecord,
    threadId: string,
    callback: Subscriber,
    onClose?: CloseSubscriber,
  ) {
    const controller = await this.registry.getController(host, threadId);
    if (!controller.isSubscribed()) {
      await controller.ensureSubscribed();
    }
    return controller.subscribe(callback, onClose);
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

  private resolveProjectId(hostId: number, projectId: number | null, cwd: unknown) {
    if (projectId || typeof cwd !== "string" || !cwd.trim()) {
      return projectId;
    }
    return projectStore.ensureForPath(hostId, cwd).id;
  }

  private pageToFullHistory(thread: any, page: TurnsPage) {
    const turns = [...(page.data ?? [])].reverse();
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

  private isFreshUnmaterializedSnapshot(snapshot: { history?: any }) {
    const turns = snapshot.history?.thread?.turns ?? snapshot.history?.turns;
    return Array.isArray(turns) && turns.length === 0;
  }
}

export const threadBroker = new ThreadBroker();
