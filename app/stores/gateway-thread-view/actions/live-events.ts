import type { GatewayEvent } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { applyAppServerEvent } from "@/stores/gateway/event-handlers";
import { appendEventToThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function createThreadLiveEventActions() {
  return {
    recordThreadEvent: appendEventToThreadView,
    applyLiveEvent: applyAppServerEvent,
    appendSelectedThreadEvent(event: GatewayEvent) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      if (
        event.hostId !== navigation.selectedHostId ||
        event.threadId !== navigation.selectedThreadId
      )
        return;
      views.lastEventId = event.id;
      views.events = [...views.events, event].slice(-500);
    },
    lastAppliedThreadEventId(hostId: number, threadId: string) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      return hostId === navigation.selectedHostId && threadId === navigation.selectedThreadId
        ? views.lastEventId
        : (views.threadViews[pinnedKey(hostId, threadId)]?.lastEventId ?? 0);
    },
  };
}
