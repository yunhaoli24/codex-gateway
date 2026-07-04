import type { HostRecord } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import type { TurnsPage } from "./types";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";

export class ThreadCatalogService {
  constructor(private readonly registry: ControllerRegistry) {}

  async listThreads(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("thread/list", params);
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("model/list", params);
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
}
