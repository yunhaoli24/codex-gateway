import type { HostRecord, ThreadGoalStatus, ThreadSettingsState } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { randomUUID } from "node:crypto";
import type {
  ServerRequestResponseInput,
  TurnsPage,
  TurnStartInput,
  TurnSteerInput,
} from "./types";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";
import { ControllerRegistry } from "./controller-registry";
import { buildTurnStartParams, buildUserInput } from "../protocol/thread-payload";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { runtimeLog } from "./runtime-log";
import { ThreadOpenService } from "./thread-open-service";

class ThreadBroker {
  private readonly registry = new ControllerRegistry();
  private readonly openService = new ThreadOpenService(this.registry);

  async openThread(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
  ) {
    return this.openService.openThread(host, threadId, projectId, limit);
  }

  async startThread(host: HostRecord, params: Record<string, unknown>, projectId: number | null) {
    const client = await this.registry.getHostClient(host);
    const result = await client.request<any>("thread/start", params);
    const started = this.openService.startedThreadResult(host, projectId, result, params.cwd);
    const controller = await this.registry.attachStartedThread(host, started.threadId, client);
    controller.setOpenSnapshot(started.snapshot);
    return started.result;
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

  async setThreadGoal(
    host: HostRecord,
    threadId: string,
    input: {
      objective?: string | null;
      status?: ThreadGoalStatus | null;
      tokenBudget?: number | null;
    },
  ) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    const params: Record<string, unknown> = { threadId };
    if ("objective" in input) params.objective = input.objective;
    if ("status" in input) params.status = input.status;
    if ("tokenBudget" in input) params.tokenBudget = input.tokenBudget;
    return controller.enqueue(() => controller.client.request("thread/goal/set", params));
  }

  async getThreadGoal(host: HostRecord, threadId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() => controller.client.request("thread/goal/get", { threadId }));
  }

  async clearThreadGoal(host: HostRecord, threadId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() => controller.client.request("thread/goal/clear", { threadId }));
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
      history: pageToFullHistory({ id: threadId }, page),
      turnsPage: pageCursorState(page),
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
    return this.openService.refreshThreadState(host, threadId, projectId, limit);
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
