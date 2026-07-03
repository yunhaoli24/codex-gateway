import type { GatewayEvent } from "~~/shared/types";
import { applyAppServerEvent } from "../event-handlers";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";
import { appendEventToThreadView } from "../thread-open/thread-view-cache";

export function handleRealtimeThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  const eventKey = pinnedKey(event.hostId, event.threadId);
  const isSelected =
    event.hostId === ctx.state.selectedHostId && event.threadId === ctx.state.selectedThreadId;
  const lastAppliedEventId = isSelected
    ? ctx.state.lastEventId
    : (ctx.state.threadViews[eventKey]?.lastEventId ?? 0);
  if (event.id <= lastAppliedEventId) {
    return;
  }
  appendSelectedThreadEvent(ctx, event);
  recordThreadEvent(ctx, event);
  applyAppServerEvent(ctx, event);
  advanceThreadSubscriptionCursor(ctx, event);
}

export function recordThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  appendEventToThreadView(ctx, event);
}

export function applyLiveThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  applyAppServerEvent(ctx, event);
}

function appendSelectedThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  if (event.hostId !== ctx.state.selectedHostId || event.threadId !== ctx.state.selectedThreadId) {
    return;
  }
  ctx.state.lastEventId = event.id;
  ctx.state.events.push(event);
  if (ctx.state.events.length > 500) {
    ctx.state.events.shift();
  }
}

function advanceThreadSubscriptionCursor(ctx: GatewayStoreContext, event: GatewayEvent) {
  const key = pinnedKey(event.hostId, event.threadId);
  const subscription = ctx.state.realtimeThreadSubscriptions[key];
  if (!subscription || event.id <= subscription.afterId) {
    return;
  }
  ctx.state.realtimeThreadSubscriptions = {
    ...ctx.state.realtimeThreadSubscriptions,
    [key]: {
      ...subscription,
      afterId: event.id,
    },
  };
}
