import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export function resubscribeRealtime(ctx: GatewayStoreContext) {
  if (ctx.state.realtimeHostLifecycleSubscribed) {
    ctx.sendRealtime({ type: "host.lifecycle.subscribe" });
  }
  for (const subscription of Object.values(ctx.state.realtimeThreadSubscriptions)) {
    ctx.sendRealtime({
      type: "thread.subscribe",
      hostId: subscription.hostId,
      threadId: subscription.threadId,
      afterId: subscription.afterId,
    });
  }
}

export function connectHostLifecycleEvents(ctx: GatewayStoreContext) {
  if (!import.meta.client) {
    return;
  }
  ctx.state.realtimeHostLifecycleSubscribed = true;
  ctx.connectRealtime();
  ctx.sendRealtime({ type: "host.lifecycle.subscribe" });
}

export function connectThreadEvents(
  ctx: GatewayStoreContext,
  hostId = ctx.state.selectedHostId,
  threadId = ctx.state.selectedThreadId,
) {
  if (!hostId || !threadId) {
    return;
  }

  const key = pinnedKey(hostId, threadId);
  const afterId =
    hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId
      ? ctx.state.lastEventId
      : (ctx.state.threadSnapshots[key]?.lastEventId ?? 0);
  const subscription = { hostId, threadId, afterId };
  const current = ctx.state.realtimeThreadSubscriptions[key];
  if (current?.hostId === hostId && current.threadId === threadId && current.afterId === afterId) {
    ctx.connectRealtime();
    return;
  }
  ctx.state.realtimeThreadSubscriptions = {
    ...ctx.state.realtimeThreadSubscriptions,
    [key]: subscription,
  };
  ctx.connectRealtime();
  ctx.sendRealtime({ type: "thread.subscribe", ...subscription });
}

export function rememberThreadSubscription(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  afterId: number,
) {
  const key = pinnedKey(hostId, threadId);
  ctx.state.realtimeThreadSubscriptions = {
    ...ctx.state.realtimeThreadSubscriptions,
    [key]: { hostId, threadId, afterId },
  };
}

export function closeThreadEvents(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const key = pinnedKey(hostId, threadId);
  const { [key]: _closed, ...subscriptions } = ctx.state.realtimeThreadSubscriptions;
  ctx.state.realtimeThreadSubscriptions = subscriptions;
  ctx.sendRealtime({ type: "thread.unsubscribe", hostId, threadId });
}
