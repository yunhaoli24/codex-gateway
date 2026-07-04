import type { HostRecord, ThreadGoalStatus, ThreadSettingsState } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { ServerRequestResponseInput, TurnStartInput, TurnSteerInput } from "./types";
import { ControllerRegistry } from "./controller-registry";
import { ThreadOpenService } from "./thread-open-service";
import { ThreadTurnCommandService } from "./turn-commands";
import { ThreadGoalService } from "./thread-goals";
import { ThreadSettingsService } from "./thread-settings";
import { ThreadCatalogService } from "./thread-catalog";

class ThreadBroker {
  private readonly registry = new ControllerRegistry();
  private readonly openService = new ThreadOpenService(this.registry);
  private readonly turnCommands = new ThreadTurnCommandService(this.registry, this.openService);
  private readonly goals = new ThreadGoalService(this.registry);
  private readonly settings = new ThreadSettingsService(this.registry);
  private readonly catalog = new ThreadCatalogService(this.registry);

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
    return this.turnCommands.startTurn(host, threadId, input);
  }

  async steerTurn(host: HostRecord, threadId: string, input: TurnSteerInput) {
    return this.turnCommands.steerTurn(host, threadId, input);
  }

  async interruptTurn(host: HostRecord, threadId: string, turnId: string) {
    return this.turnCommands.interruptTurn(host, threadId, turnId);
  }

  async respondToServerRequest(
    host: HostRecord,
    threadId: string,
    input: ServerRequestResponseInput,
  ) {
    return this.turnCommands.respondToServerRequest(host, threadId, input);
  }

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    return this.settings.updateThreadSettings(host, threadId, input);
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
    return this.goals.setThreadGoal(host, threadId, input);
  }

  async getThreadGoal(host: HostRecord, threadId: string) {
    return this.goals.getThreadGoal(host, threadId);
  }

  async clearThreadGoal(host: HostRecord, threadId: string) {
    return this.goals.clearThreadGoal(host, threadId);
  }

  async listThreads(host: HostRecord, params: Record<string, unknown>) {
    return this.catalog.listThreads(host, params);
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    return this.catalog.listModels(host, params);
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    return this.settings.renameThread(host, threadId, name);
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
    return this.catalog.listThreadTurns(host, threadId, params);
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
