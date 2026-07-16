import type { GatewayEvent, RealtimeClientMessage } from "~~/shared/types";
import { CLIENT_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey } from "../gateway/thread-utils/identity";

interface RealtimeThreadSubscription {
  hostId: number;
  threadId: string;
  afterId: number;
}

interface RealtimeThreadSubscriptionOptions {
  connect: () => void;
  send: (message: RealtimeClientMessage) => boolean;
}

export function createRealtimeThreadSubscriptions(options: RealtimeThreadSubscriptionOptions) {
  const state = reactive({
    hostLifecycleSubscribed: false,
    threadSubscriptions: {} as Record<string, RealtimeThreadSubscription>,
  });

  function connectHostLifecycleEvents() {
    if (!import.meta.client) return;
    state.hostLifecycleSubscribed = true;
    options.connect();
    options.send({ type: "host.lifecycle.subscribe" });
  }

  function connectThreadEvents(hostId?: number | null, threadId?: string | null) {
    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    const resolvedHostId = hostId ?? navigation.selectedHostId;
    const resolvedThreadId = threadId ?? navigation.selectedThreadId;
    if (!resolvedHostId || !resolvedThreadId) return;

    const key = pinnedKey(resolvedHostId, resolvedThreadId);
    const afterId =
      resolvedHostId === navigation.selectedHostId &&
      resolvedThreadId === navigation.selectedThreadId
        ? views.lastEventId
        : (views.threadViews[key]?.lastEventId ?? 0);
    const subscription = { hostId: resolvedHostId, threadId: resolvedThreadId, afterId };
    rememberSubscription(key, subscription);
    options.connect();
    sendThreadSubscribe(subscription);
  }

  function rememberThreadSubscription(hostId: number, threadId: string, afterId: number) {
    rememberSubscription(pinnedKey(hostId, threadId), { hostId, threadId, afterId });
  }

  function rememberSubscription(key: string, subscription: RealtimeThreadSubscription) {
    const { [key]: _existing, ...subscriptions } = state.threadSubscriptions;
    const entries = Object.entries({ ...subscriptions, [key]: subscription });
    const protectedKeys = protectedThreadSubscriptionKeys();
    while (entries.length > CLIENT_THREAD_CACHE_LIMIT) {
      const index = entries.findIndex(([candidate]) => !protectedKeys.has(candidate));
      if (index < 0) break;
      const [, evicted] = entries.splice(index, 1)[0]!;
      options.send({
        type: "thread.unsubscribe",
        hostId: evicted.hostId,
        threadId: evicted.threadId,
      });
    }
    state.threadSubscriptions = Object.fromEntries(entries);
  }

  function protectedThreadSubscriptionKeys() {
    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    const keys = new Set<string>();
    if (navigation.selectedHostId && navigation.selectedThreadId) {
      keys.add(pinnedKey(navigation.selectedHostId, navigation.selectedThreadId));
    }
    for (const panel of views.visibleSubAgentPanels) {
      keys.add(pinnedKey(panel.hostId, panel.threadId));
    }
    return keys;
  }

  function closeThreadEvents(hostId: number, threadId: string) {
    const key = pinnedKey(hostId, threadId);
    const { [key]: _closed, ...subscriptions } = state.threadSubscriptions;
    state.threadSubscriptions = subscriptions;
    options.send({ type: "thread.unsubscribe", hostId, threadId });
  }

  function closeHostThreadEvents(hostId: number) {
    const remaining: Record<string, RealtimeThreadSubscription> = {};
    for (const [key, subscription] of Object.entries(state.threadSubscriptions)) {
      if (subscription.hostId === hostId) {
        options.send({
          type: "thread.unsubscribe",
          hostId: subscription.hostId,
          threadId: subscription.threadId,
        });
      } else {
        remaining[key] = subscription;
      }
    }
    state.threadSubscriptions = remaining;
  }

  function resubscribe() {
    if (state.hostLifecycleSubscribed) options.send({ type: "host.lifecycle.subscribe" });
    for (const subscription of Object.values(state.threadSubscriptions)) {
      sendThreadSubscribe(subscription);
    }
  }

  function advanceThreadSubscriptionCursor(event: GatewayEvent) {
    const key = pinnedKey(event.hostId, event.threadId);
    const subscription = state.threadSubscriptions[key];
    if (!subscription || event.id <= subscription.afterId) return;
    state.threadSubscriptions = {
      ...state.threadSubscriptions,
      [key]: { ...subscription, afterId: event.id },
    };
  }

  function reset() {
    state.hostLifecycleSubscribed = false;
    state.threadSubscriptions = {};
  }

  function sendThreadSubscribe(subscription: RealtimeThreadSubscription) {
    options.send({
      type: "thread.subscribe",
      hostId: subscription.hostId,
      threadId: subscription.threadId,
      afterId: subscription.afterId,
    });
  }

  return {
    state,
    connectHostLifecycleEvents,
    connectThreadEvents,
    rememberThreadSubscription,
    closeThreadEvents,
    closeHostThreadEvents,
    resubscribe,
    advanceThreadSubscriptionCursor,
    reset,
  };
}
