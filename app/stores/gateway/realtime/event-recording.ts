import type { GatewayEvent } from "~~/shared/types";
import { applyAppServerEvent } from "../event-handlers";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export function handleRealtimeThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  const eventKey = pinnedKey(event.hostId, event.threadId);
  const snapshotLastEventId = ctx.state.threadSnapshots[eventKey]?.lastEventId ?? 0;
  const currentLastEventId =
    event.hostId === ctx.state.selectedHostId && event.threadId === ctx.state.selectedThreadId
      ? ctx.state.lastEventId
      : 0;
  if (event.id <= Math.max(snapshotLastEventId, currentLastEventId)) {
    return;
  }
  appendSelectedThreadEvent(ctx, event);
  recordThreadEvent(ctx, event);
  applyAppServerEvent(ctx, event);
  advanceThreadSubscriptionCursor(ctx, event);
}

export function recordThreadEvent(ctx: GatewayStoreContext, event: GatewayEvent) {
  const key = pinnedKey(event.hostId, event.threadId);
  const snapshot = ctx.state.threadSnapshots[key];
  if (!snapshot || event.id <= snapshot.lastEventId) {
    return;
  }
  const events = [...snapshot.events, event].slice(-500);
  ctx.state.threadSnapshots[key] = {
    ...snapshot,
    events,
    lastEventId: event.id,
  };
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
