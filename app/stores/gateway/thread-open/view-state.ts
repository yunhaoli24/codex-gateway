import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { writeGatewayRouteSelection } from "../route-state";
import {
  activateThreadViewFromCache,
  clearSelectedThreadView,
  saveSelectedThreadView,
} from "./thread-view-cache";

export function beginViewTransition() {
  const views = useGatewayThreadViewStore();
  views.viewEpoch += 1;
  return views.viewEpoch;
}

export function isCurrentViewTransition(epoch: number) {
  return useGatewayThreadViewStore().viewEpoch === epoch;
}

export const cacheSelectedThreadView = saveSelectedThreadView;
export const restoreThreadView = activateThreadViewFromCache;
export const clearCurrentThreadView = clearSelectedThreadView;

export function rememberOpenThread(threadId: string) {
  const navigation = useGatewayNavigationStore();
  if (!navigation.selectedHostId) return;
  navigation.rememberOpenThread({
    hostId: navigation.selectedHostId,
    projectId: navigation.selectedProjectId,
    threadId,
  });
}

export function requestScrollToLatest() {
  useGatewayThreadViewStore().scrollToLatestToken += 1;
}

export function syncSelectedRoute(options: { replace?: boolean } = {}) {
  const navigation = useGatewayNavigationStore();
  writeGatewayRouteSelection(
    {
      hostId: navigation.selectedHostId,
      projectId: navigation.selectedProjectId,
      threadId: navigation.selectedThreadId,
    },
    options,
  );
}

export function activateThreadView(hostId: number, projectId: number | null) {
  const navigation = useGatewayNavigationStore();
  navigation.selectedHostId = hostId;
  navigation.selectedProjectId = projectId;
  clearCurrentThreadView();
}

export function activatePendingThreadView(
  hostId: number,
  projectId: number | null,
  threadId: string,
) {
  activateThreadView(hostId, projectId);
  useGatewayNavigationStore().selectedThreadId = threadId;
}
