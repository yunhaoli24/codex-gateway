import type { GatewayEvent } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useAuthStore } from "@/stores/auth";
import {
  appendEventsToThreadView,
  markThreadEventsApplied,
} from "@/stores/gateway/thread-open/thread-view-cache";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import { useEventListener, useTimeoutFn } from "@vueuse/core";
import { retainThreadEvents } from "../memory/events";

const BACKGROUND_FLUSH_DELAY_MS = 100;

export function createThreadLiveEventActions() {
  const pendingEvents: GatewayEvent[] = [];
  const pendingLastEventIds = new Map<string, number>();
  let flushHandle: number | null = null;
  let queuedSessionEpoch: number | null = null;
  const flushTimer = useTimeoutFn(flushQueuedEvents, BACKGROUND_FLUSH_DELAY_MS, {
    immediate: false,
  });

  useEventListener(
    () => (import.meta.client ? document : null),
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden" && pendingEvents.length > 0) flushQueuedEvents();
    },
  );

  function queueThreadEvent(event: GatewayEvent) {
    const sessionEpoch = useAuthStore().sessionEpoch;
    if (queuedSessionEpoch !== null && queuedSessionEpoch !== sessionEpoch) resetLiveEvents();
    queuedSessionEpoch = sessionEpoch;
    // User messages must be reduced immediately. They are low-volume transcript rows, and
    // delaying them behind a snapshot or a frame-sized delta batch can make another page appear
    // to lose the message until an intermediate section is opened.
    if (isCanonicalUserMessage(event)) {
      flushQueuedEvents();
      applyImmediateThreadEvent(event);
      return;
    }
    pendingEvents.push(event);
    const key = pinnedKey(event.hostId, event.threadId);
    pendingLastEventIds.set(key, Math.max(pendingLastEventIds.get(key) ?? 0, event.id));
    if (flushHandle !== null || flushTimer.isPending.value) return;
    // Reduce high-frequency app-server deltas to one reactive commit per paint. Applying every
    // delta synchronously repeatedly copied the event arrays and thread-view cache before the
    // browser had a chance to render the streamed text.
    flushHandle = requestAnimationFrame(flushQueuedEvents);
    // Browsers pause RAF for hidden pages while WebSocket messages continue to arrive. A bounded
    // timer fallback keeps draining the exact same batch instead of retaining every token delta
    // until the tab becomes visible and then projecting an unbounded burst.
    flushTimer.start();
  }

  function flushQueuedEvents() {
    if (flushHandle !== null) cancelAnimationFrame(flushHandle);
    flushHandle = null;
    flushTimer.stop();
    const auth = useAuthStore();
    if (queuedSessionEpoch === null || !auth.isCurrentSession(queuedSessionEpoch)) {
      resetLiveEvents();
      return;
    }
    const events = pendingEvents.splice(0).sort((left, right) => left.id - right.id);
    queuedSessionEpoch = null;
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
        const fresh = threadEvents.filter(
          (event) => event.id > (views.appliedEventId ?? views.lastEventId),
        );
        if (fresh.length) {
          views.events = retainThreadEvents([...views.events, ...fresh]);
          views.lastEventId = fresh.at(-1)!.id;
        }
      } else {
        appendEventsToThreadView(threadEvents);
      }
      // App-server deltas must still be interpreted in order, but their history reducers are
      // committed once per thread. Otherwise one animation frame still copies the same timeline
      // and view cache once for every token-sized delta.
      gatewayDomainEvents.emit("history-events-project", { events: threadEvents });
      if (selected) {
        views.appliedEventId = Math.max(
          views.appliedEventId ?? views.lastEventId,
          ...threadEvents.map((event) => event.id),
        );
      } else {
        markThreadEventsApplied(threadEvents);
      }
    }
  }

  function applyImmediateThreadEvent(event: GatewayEvent) {
    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    const selected =
      event.hostId === navigation.selectedHostId && event.threadId === navigation.selectedThreadId;
    const cachedView = views.threadViews[pinnedKey(event.hostId, event.threadId)];
    const appliedEventId = selected
      ? (views.appliedEventId ?? views.lastEventId)
      : (cachedView?.appliedEventId ?? cachedView?.lastEventId ?? 0);
    if (event.id <= appliedEventId) return;

    if (selected) {
      views.events = retainThreadEvents([...views.events, event]);
      views.lastEventId = Math.max(views.lastEventId, event.id);
    } else {
      appendEventsToThreadView([event]);
    }
    gatewayDomainEvents.emit("history-events-project", { events: [event] });
    if (selected) {
      views.appliedEventId = Math.max(views.appliedEventId ?? 0, event.id);
    } else {
      markThreadEventsApplied([event]);
    }
  }

  function resetLiveEvents() {
    if (flushHandle !== null) cancelAnimationFrame(flushHandle);
    flushHandle = null;
    flushTimer.stop();
    pendingEvents.length = 0;
    pendingLastEventIds.clear();
    queuedSessionEpoch = null;
  }

  return {
    applyLiveEvent(event: GatewayEvent) {
      gatewayDomainEvents.emit("history-events-project", { events: [event] });
      markThreadEventsApplied([event]);
    },
    applyLiveEvents(events: GatewayEvent[]) {
      if (events.length) {
        gatewayDomainEvents.emit("history-events-project", { events });
        markThreadEventsApplied(events);
      }
    },
    queueThreadEvent,
    resetLiveEvents,
    lastAppliedThreadEventId(hostId: number, threadId: string) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const applied =
        hostId === navigation.selectedHostId && threadId === navigation.selectedThreadId
          ? (views.appliedEventId ?? views.lastEventId)
          : (views.threadViews[pinnedKey(hostId, threadId)]?.appliedEventId ??
            views.threadViews[pinnedKey(hostId, threadId)]?.lastEventId ??
            0);
      return Math.max(applied, pendingLastEventIds.get(pinnedKey(hostId, threadId)) ?? 0);
    },
  };
}

function isCanonicalUserMessage(event: GatewayEvent) {
  return event.event.type === "timeline.item.upsert" && event.event.item.type === "userMessage";
}
