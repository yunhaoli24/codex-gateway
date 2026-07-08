import type { HostRecord } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import type { TurnsPage } from "./types";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";

export interface ThreadTurnsListInput {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export class ThreadHistoryReader {
  constructor(private readonly registry: ControllerRegistry) {}

  async listThreadTurns(host: HostRecord, threadId: string, input: ThreadTurnsListInput) {
    const client = await this.registry.getHostClient(host);
    const page = await client.request<TurnsPage>("thread/turns/list", {
      threadId,
      cursor: input.cursor ?? null,
      limit: input.limit ?? DEFAULT_TURN_PAGE_LIMIT,
      sortDirection: input.sortDirection ?? "desc",
      itemsView: "full",
    });

    return {
      history: pageToFullHistory({ id: threadId }, page),
      turnsPage: pageCursorState(page),
    };
  }
}
