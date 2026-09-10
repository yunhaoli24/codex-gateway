import type {
  AgentProviderId,
  HostRecord,
  ThreadGoalStatus,
  ThreadSettingsState,
} from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import type { ServerRequestResponseInput, TurnStartInput, TurnSteerInput } from "./types";
import { ControllerRegistry, type ThreadSubscriptionLease } from "./controller-registry";
import { ThreadOpenService } from "./thread-open-service";
import { ThreadTurnCommandService } from "./turn-commands";
import { ThreadGoalService } from "./thread-goals";
import { ThreadSettingsService } from "./thread-settings";
import { ThreadCatalogService } from "./thread-catalog";
import { ThreadHistoryReader } from "./thread-history-reader";
import { McpRuntimeService } from "./mcp-runtime";
import { AppServerFileService } from "./app-server-files";

class ThreadBroker {
  private readonly registry = new ControllerRegistry();
  private readonly historyReader = new ThreadHistoryReader(this.registry);
  private readonly openService = new ThreadOpenService(this.registry, this.historyReader);
  private readonly turnCommands = new ThreadTurnCommandService(this.registry, this.openService);
  private readonly goals = new ThreadGoalService(this.registry);
  private readonly settings = new ThreadSettingsService(this.registry);
  private readonly catalog = new ThreadCatalogService(this.registry);
  private readonly mcp = new McpRuntimeService(this.registry);
  private readonly files = new AppServerFileService(this.registry);

  async openThread(
    host: HostRecord,
    threadId: string,
    projectId: number | null,
    limit = INITIAL_TURN_PAGE_LIMIT,
    controller?: Awaited<ThreadSubscriptionLease["ready"]>,
  ) {
    return this.openService.openThread(host, threadId, projectId, limit, controller);
  }

  async startThread(
    host: HostRecord,
    params: Record<string, unknown>,
    projectId: number | null,
    providerId: AgentProviderId = "codex",
  ) {
    const client = await this.registry.getHostClient(host, providerId);
    // Paginated history is the current App Server storage model that can hydrate indexed Turn
    // pages without replaying an entire rollout JSONL. Keep this policy at the protocol boundary so
    // every Gateway-created thread uses it and browser DTOs do not need to expose storage details.
    const result = await client.request("thread/start", {
      ...params,
      historyMode: "paginated",
      // This official opt-in is fixed at thread creation and cannot be enabled by thread/resume.
      // It exposes exact per-response usage metadata without changing persisted rollout history.
      experimentalRawEvents: true,
    });
    const started = this.openService.startedThreadResult(host, projectId, result);
    await this.registry.retainStartedThreadSubscription(host, started.threadId);
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

  async updateTurnSettings(
    host: HostRecord,
    threadId: string,
    turnId: string,
    input: Pick<ThreadSettingsState, "model" | "effort">,
  ) {
    return this.settings.updateTurnSettings(host, threadId, turnId, input);
  }

  async resolveThreadSettings(host: HostRecord, threadId: string) {
    return this.settings.resolveThreadSettings(host, threadId);
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
    return this.historyReader.listThreadTurns(host, threadId, params);
  }

  async listThreadItems(
    host: HostRecord,
    threadId: string,
    params: {
      turnId: string;
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    },
  ) {
    return this.historyReader.listThreadItems(host, threadId, params);
  }

  async getHostClient(host: HostRecord) {
    return this.registry.getHostClient(host);
  }

  async searchProjectFiles(
    host: HostRecord,
    rootPath: string,
    query: string,
    cancellationToken: string,
  ) {
    return this.files.search(host, rootPath, query, cancellationToken);
  }

  async watchProjectFiles(
    host: HostRecord,
    path: string,
    listener: Parameters<AppServerFileService["watch"]>[2],
  ) {
    return this.files.watch(host, path, listener);
  }

  async listMcpStatuses(host: HostRecord, threadId: string) {
    return this.mcp.listStatuses(host, threadId);
  }

  async startMcpEventStream(
    host: HostRecord,
    input: Parameters<McpRuntimeService["startEventStream"]>[1],
  ) {
    return this.mcp.startEventStream(host, input);
  }

  async stopMcpEventStream(host: HostRecord, subscriptionId: string) {
    return this.mcp.stopEventStream(host, subscriptionId);
  }

  controllersForHost(hostId: number) {
    return this.registry.controllersForHost(hostId);
  }

  hasController(hostId: number, threadId: string) {
    return this.registry.hasController(hostId, threadId);
  }

  retainUpstreamSubscription(host: HostRecord, threadId: string, owner: "browser" | "scoped") {
    return this.registry.retainSubscription(host, threadId, owner);
  }

  retainThreadActivation(host: HostRecord, threadId: string) {
    return this.registry.retainActivationController(host, threadId);
  }

  isThreadRunning(hostId: number, threadId: string) {
    return this.openService.isThreadRunning(hostId, threadId);
  }

  async restoreRetainedSubscriptions(host: HostRecord) {
    await this.registry.restoreRetainedSubscriptions(host);
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

  async refreshThreadRuntimeStatus(host: HostRecord, threadId: string) {
    return this.openService.refreshThreadRuntimeStatus(host, threadId);
  }
}

export const threadBroker = new ThreadBroker();
