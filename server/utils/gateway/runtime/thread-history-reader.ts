import type { AppServerThread, HostRecord, ThreadTimelineItem } from "~~/shared/types";
import {
  parseThreadTimelinePage,
  parseThreadItemsReadResponse,
} from "~~/shared/runtime/app-server";
import { timelinePageItemsForTurn } from "~~/shared/thread-history/app-server-timeline";
import { threadTimelinePageStore } from "../state/thread-timeline-pages";
import type { ControllerRegistry } from "./controller-registry";
import { DEFAULT_TIMELINE_PAGE_LIMIT } from "./types";
import { INITIAL_TIMELINE_PAGE_LIMIT } from "~~/shared/config";
import type { RecoveredTurnTail } from "./thread-tail-recovery";

export class ThreadHistoryReader {
  constructor(private readonly registry: ControllerRegistry) {}

  async loadInitialTimelinePage(
    host: HostRecord,
    thread: AppServerThread,
    limit = INITIAL_TIMELINE_PAGE_LIMIT,
  ) {
    return this.fetchTimelinePage(host, thread.id, null, limit);
  }

  async listTimelinePage(
    host: HostRecord,
    threadId: string,
    cursor: string | null,
    limit?: number,
  ) {
    // Official history is independent of our disposable snapshot. A reader may expand an old
    // Turn after its idle cache expired; authorization/existence still belong to Host/RPC.
    return this.fetchTimelinePage(host, threadId, cursor, limit);
  }

  async readItems(host: HostRecord, threadId: string, turnId: string, itemIds: string[]) {
    const client = await this.registry.getHostClient(host);
    // Details must come from the requested persisted items, not a walk from the latest timeline
    // page. Do not populate the history cache or infer missing events from this separate read.
    return client.request(
      "thread/items/read",
      { threadId, turnId, itemIds },
      120_000,
      parseThreadItemsReadResponse,
    );
  }

  async recoverLatestTurnTail(
    host: HostRecord,
    threadId: string,
    turnId: string,
  ): Promise<RecoveredTurnTail> {
    const latestPage = await this.fetchTimelinePage(host, threadId, null);
    const tailItems: ThreadTimelineItem[] = timelinePageItemsForTurn(latestPage, turnId);
    const complete = latestPage.data.some(
      (entry) => entry.type === "turnStarted" && entry.turnId === turnId,
    );

    return {
      turnId,
      olderUserItems: [],
      tailItems,
      complete,
    };
  }

  private async fetchTimelinePage(
    host: HostRecord,
    threadId: string,
    cursor: string | null,
    limit = DEFAULT_TIMELINE_PAGE_LIMIT,
  ) {
    const cached = threadTimelinePageStore.get(host.id, threadId, cursor, limit);
    if (cached !== null) return cached;
    const client = await this.registry.getHostClient(host);
    const page = await client.request(
      "thread/timeline/list",
      { threadId, cursor, limit },
      120_000,
      parseThreadTimelinePage,
    );
    threadTimelinePageStore.set(host.id, threadId, cursor, limit, page);
    return page;
  }
}
