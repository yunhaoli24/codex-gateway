import type { GatewayEvent } from "~~/shared/types";
import { applyAppServerEvent } from "../event-handlers";
import { appendEventToThreadView } from "../thread-open/thread-view-cache";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

export function createThreadLiveEventActions(ctx: GatewayStoreContext) {
  return {
    recordThreadEvent(event: GatewayEvent) {
      appendEventToThreadView(ctx, event);
    },

    applyLiveEvent(event: GatewayEvent) {
      applyAppServerEvent(ctx, event);
    },

    appendSelectedThreadEvent(event: GatewayEvent) {
      if (
        event.hostId !== ctx.state.selectedHostId ||
        event.threadId !== ctx.state.selectedThreadId
      ) {
        return;
      }
      ctx.state.lastEventId = event.id;
      ctx.state.events.push(event);
      if (ctx.state.events.length > 500) {
        ctx.state.events.shift();
      }
    },

    lastAppliedThreadEventId(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId);
      return hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId
        ? ctx.state.lastEventId
        : (ctx.state.threadViews[key]?.lastEventId ?? 0);
    },
  };
}
