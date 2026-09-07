import type { AppServerThread, HostRecord } from "~~/shared/types";
import { parseThreadItemsPage, parseTurnsPage } from "~~/shared/runtime/app-server";
import {
  asThreadTimelineItem,
  projectThreadTimelineHistory,
} from "~~/shared/thread-history/timeline";
import { threadSnapshotStore } from "../state/thread-snapshots";
import type { ControllerRegistry } from "./controller-registry";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { DEFAULT_TURN_PAGE_LIMIT, type TurnsPage } from "./types";
import { readLegacyTurnItems } from "./legacy-turn-items";

export interface ThreadTurnsListInput {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export class ThreadHistoryReader {
  constructor(private readonly registry: ControllerRegistry) {}

  async loadInitialTurnsPage(
    host: HostRecord,
    thread: AppServerThread,
    limit: number,
    resumedPage?: TurnsPage,
  ) {
    // Keep the two upstream history contracts separate at this boundary. Paginated histories can
    // reuse thread/resume's bounded summary page and fetch items on demand. Legacy histories have
    // no stable item-page API, so initial Turn pages are requested with full items. Subsequent live
    // notifications may still need hydration; that separate path reads full legacy Turn pages too.
    if (resumedPage !== undefined) {
      return resumedPage;
    }
    return this.fetchTurnsPage(host, thread.id, thread.historyMode, {
      cursor: null,
      limit,
      sortDirection: "desc",
    });
  }

  async listThreadTurns(host: HostRecord, threadId: string, input: ThreadTurnsListInput) {
    const snapshot = this.requireSnapshot(host.id, threadId);
    const page = await this.fetchTurnsPage(host, threadId, snapshot.thread.historyMode, input);
    return {
      history: projectThreadTimelineHistory(pageToFullHistory({ id: threadId }, page)),
      turnsPage: pageCursorState(page),
    };
  }

  async listThreadItems(
    host: HostRecord,
    threadId: string,
    input: {
      turnId: string;
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    },
  ) {
    const snapshot = this.requireSnapshot(host.id, threadId);
    const cached = snapshot.history.thread.turns.find((turn) => turn.id === input.turnId);
    if (cached?.itemsView === "full" && input.cursor == null) {
      return {
        turnId: input.turnId,
        items: input.sortDirection === "desc" ? [...cached.items].reverse() : cached.items,
        nextCursor: null,
        backwardsCursor: null,
      };
    }
    const client = await this.registry.getHostClient(host);
    if (snapshot.thread.historyMode === "legacy") {
      const items = await readLegacyTurnItems(client, host, threadId, input.turnId);
      return {
        turnId: input.turnId,
        items: input.sortDirection === "desc" ? [...items].reverse() : items,
        nextCursor: null,
        backwardsCursor: null,
      };
    }
    const page = await client.request(
      "thread/items/list",
      {
        threadId,
        turnId: input.turnId,
        cursor: input.cursor ?? null,
        limit: input.limit ?? 100,
        sortDirection: input.sortDirection ?? "asc",
      },
      120_000,
      parseThreadItemsPage,
    );
    return {
      turnId: input.turnId,
      items: page.data.flatMap((entry) => {
        const item = asThreadTimelineItem(entry.item);
        return item === null ? [] : [item];
      }),
      nextCursor: page.nextCursor,
      backwardsCursor: page.backwardsCursor,
    };
  }

  private async fetchTurnsPage(
    host: HostRecord,
    threadId: string,
    historyMode: AppServerThread["historyMode"],
    input: ThreadTurnsListInput,
  ) {
    const client = await this.registry.getHostClient(host);
    return client.request(
      "thread/turns/list",
      {
        threadId,
        cursor: input.cursor ?? null,
        limit: input.limit ?? DEFAULT_TURN_PAGE_LIMIT,
        sortDirection: input.sortDirection ?? "desc",
        itemsView: historyMode === "paginated" ? "summary" : "full",
      },
      120_000,
      parseTurnsPage,
    );
  }

  private requireSnapshot(hostId: number, threadId: string) {
    const snapshot = threadSnapshotStore.get(hostId, threadId);
    if (snapshot === null) throw new Error("Thread snapshot is unavailable while paging history");
    return snapshot;
  }
}
