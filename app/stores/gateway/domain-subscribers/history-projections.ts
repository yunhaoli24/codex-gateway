import type { ThreadHistorySeed, ThreadHistoryState } from "~~/shared/thread-history/types";
import { applyCanonicalEventToHistory } from "~~/shared/thread-history/canonical-events";
import { mergeItemIntoLatestTurn } from "~~/shared/thread-history/items";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { applyAppServerEvent } from "../event-handlers";
import { gatewayDomainEvents } from "../domain-events";
import { patchThreadView, setSelectedThreadHistory } from "../thread-open/thread-view-cache";
import { pinnedKey } from "../thread-utils/identity";

type HistoryUpdate = (
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
) => ThreadHistoryState | null;

interface PendingHistoryProjection {
  hostId: number;
  threadId: string;
  updates: HistoryUpdate[];
}

let pendingHistoryProjections: Map<string, PendingHistoryProjection> | null = null;

export function registerHistoryProjectionSubscribers() {
  gatewayDomainEvents.on("realtime-thread-event", ({ event }) => {
    const views = useGatewayThreadViewStore();
    if (event.id <= views.lastAppliedThreadEventId(event.hostId, event.threadId)) return;
    views.queueThreadEvent(event);
  });
  gatewayDomainEvents.on("history-events-project", ({ events }) => {
    batchGatewayHistoryProjections(() => {
      for (const event of events) {
        // The provider boundary has already produced the canonical event. Apply it directly to
        // the local history instead of translating it back into raw Codex-style `params` and
        // projecting it a second time through compatibility events. The dispatcher remains the
        // side-effect path for status, notifications, approvals, and file refreshes.
        updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
          applyCanonicalEventToHistory(history, currentThread, event.threadId, event.event),
        );
        applyAppServerEvent(event);
      }
    });
  });
  gatewayDomainEvents.on("history-item-upsert", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      mergeItemIntoLatestTurn(history, currentThread, event.threadId, event.item),
    );
  });
}

function batchGatewayHistoryProjections(applyEvents: () => void) {
  if (pendingHistoryProjections) {
    applyEvents();
    return;
  }
  pendingHistoryProjections = new Map();
  try {
    applyEvents();
    for (const projection of pendingHistoryProjections.values()) {
      applyThreadHistoryUpdates(projection.hostId, projection.threadId, projection.updates);
    }
  } finally {
    pendingHistoryProjections = null;
  }
}

function updateThreadHistory(hostId: number, threadId: string, update: HistoryUpdate) {
  if (pendingHistoryProjections) {
    const key = pinnedKey(hostId, threadId);
    const projection = pendingHistoryProjections.get(key) ?? { hostId, threadId, updates: [] };
    projection.updates.push(update);
    pendingHistoryProjections.set(key, projection);
    return;
  }
  applyThreadHistoryUpdates(hostId, threadId, [update]);
}

function applyThreadHistoryUpdates(hostId: number, threadId: string, updates: HistoryUpdate[]) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    setSelectedThreadHistory(
      updates.reduce((history, update) => update(history, views.currentThread), views.history),
    );
    views.cacheSelectedThreadView();
    return;
  }
  const view = views.threadViews[pinnedKey(hostId, threadId)];
  if (view) {
    patchThreadView(hostId, threadId, {
      history: updates.reduce(
        (history, update) => update(history, view.currentThread),
        view.history,
      ),
    });
  }
}
