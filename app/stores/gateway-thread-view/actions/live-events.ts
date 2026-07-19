import type { GatewayEvent } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { applyAppServerEvent } from "@/stores/gateway/event-handlers";
import { appendEventsToThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function createThreadLiveEventActions() {
  const pendingEvents: GatewayEvent[] = [];
  const pendingLastEventIds = new Map<string, number>();
  let flushHandle: number | null = null;

  function queueThreadEvent(event: GatewayEvent) {
    pendingEvents.push(event);
    const key = pinnedKey(event.hostId, event.threadId);
    pendingLastEventIds.set(key, Math.max(pendingLastEventIds.get(key) ?? 0, event.id));
    if (flushHandle !== null) return;
    // Reduce high-frequency app-server deltas to one reactive commit per paint. Applying every
    // delta synchronously repeatedly copied the event arrays and thread-view cache before the
    // browser had a chance to render the streamed text.
    flushHandle = requestAnimationFrame(flushQueuedEvents);
  }

  function flushQueuedEvents() {
    flushHandle = null;
    const events = pendingEvents.splice(0).sort((left, right) => left.id - right.id);
    pendingLastEventIds.clear();
    const byThread = new Map<string, GatewayEvent[]>();
    for (const event of events) {
      const key = pinnedKey(event.hostId, event.threadId);
      const threadEvents = byThread.get(key) ?? [];
      threadEvents.push(event);
      byThread.set(key, threadEvents);
    }

    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    for (const threadEvents of byThread.values()) {
      const first = threadEvents[0]!;
      const selected =
        first.hostId === navigation.selectedHostId &&
        first.threadId === navigation.selectedThreadId;
      if (selected) {
        const fresh = threadEvents.filter((event) => event.id > views.lastEventId);
        if (fresh.length) {
          views.events = [...views.events, ...fresh].slice(-500);
          views.lastEventId = fresh.at(-1)!.id;
        }
      } else {
        appendEventsToThreadView(threadEvents);
      }
      for (const event of threadEvents) applyAppServerEvent(event);
    }
  }

  return {
    applyLiveEvent: applyAppServerEvent,
    queueThreadEvent,
    lastAppliedThreadEventId(hostId: number, threadId: string) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const applied =
        hostId === navigation.selectedHostId && threadId === navigation.selectedThreadId
          ? views.lastEventId
          : (views.threadViews[pinnedKey(hostId, threadId)]?.lastEventId ?? 0);
      return Math.max(applied, pendingLastEventIds.get(pinnedKey(hostId, threadId)) ?? 0);
    },
  };
}
