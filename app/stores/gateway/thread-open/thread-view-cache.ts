import type { GatewayEvent } from "~~/shared/types";
import { CLIENT_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey } from "../thread-utils/identity";
import type { ThreadViewState } from "../types";

export function threadViewKey(hostId: number, threadId: string) {
  return pinnedKey(hostId, threadId);
}

export function selectedThreadViewKey() {
  const navigation = useGatewayNavigationStore();
  return navigation.selectedHostId && navigation.selectedThreadId
    ? threadViewKey(navigation.selectedHostId, navigation.selectedThreadId)
    : null;
}

export function selectedThreadView() {
  const views = useGatewayThreadViewStore();
  const key = selectedThreadViewKey();
  return key ? (views.threadViews[key] ?? null) : null;
}

export function upsertThreadView(view: ThreadViewState) {
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(view.hostId, view.threadId);
  const { [key]: _existing, ...remaining } = views.threadViews;
  views.threadViews = pruneThreadViews({ ...remaining, [key]: view });
}

function pruneThreadViews(threadViews: Record<string, ThreadViewState>) {
  const views = useGatewayThreadViewStore();
  const protectedKeys = new Set<string>();
  const selectedKey = selectedThreadViewKey();
  if (selectedKey) protectedKeys.add(selectedKey);
  for (const panel of views.subAgentPanels) {
    protectedKeys.add(threadViewKey(panel.hostId, panel.threadId));
  }
  const entries = Object.entries(threadViews);
  while (entries.length > CLIENT_THREAD_CACHE_LIMIT) {
    const index = entries.findIndex(([key]) => !protectedKeys.has(key));
    if (index < 0) break;
    entries.splice(index, 1);
  }
  return Object.fromEntries(entries);
}

export function patchThreadView(hostId: number, threadId: string, patch: Partial<ThreadViewState>) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(hostId, threadId);
  const existing = views.threadViews[key] ?? emptyThreadView(hostId, threadId);
  const next = { ...existing, ...patch, hostId, threadId };
  upsertThreadView(next);
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    activateThreadViewFromCache(hostId, threadId);
  }
  return next;
}

export function activateThreadViewFromCache(hostId: number, threadId: string) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const view = views.threadViews[threadViewKey(hostId, threadId)];
  if (!view) return false;
  navigation.selectedHostId = view.hostId;
  navigation.selectedProjectId = view.projectId;
  navigation.selectedThreadId = view.threadId;
  views.currentThread = view.currentThread;
  views.history = view.history;
  views.events = [...view.events];
  views.olderTurnsCursor = view.olderTurnsCursor;
  views.newerTurnsCursor = view.newerTurnsCursor;
  views.lastEventId = view.lastEventId;
  return true;
}

export function saveSelectedThreadView() {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (
    !navigation.selectedHostId ||
    !navigation.selectedThreadId ||
    !views.currentThread ||
    !views.history
  ) {
    return;
  }
  upsertThreadView({
    hostId: navigation.selectedHostId,
    projectId: navigation.selectedProjectId,
    threadId: navigation.selectedThreadId,
    currentThread: views.currentThread,
    history: views.history,
    events: [...views.events],
    olderTurnsCursor: views.olderTurnsCursor,
    newerTurnsCursor: views.newerTurnsCursor,
    lastEventId: views.lastEventId,
    loading: false,
    error: null,
  });
}

export function clearSelectedThreadView() {
  const navigation = useGatewayNavigationStore();
  navigation.selectedThreadId = null;
  useGatewayThreadViewStore().resetCurrentView();
}

export function removeThreadView(hostId: number, threadId: string) {
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(hostId, threadId);
  const { [key]: _removed, ...remaining } = views.threadViews;
  views.threadViews = remaining;
}

export function appendEventToThreadView(event: GatewayEvent) {
  appendEventsToThreadView([event]);
}

export function appendEventsToThreadView(events: GatewayEvent[]) {
  if (!events.length) return;
  const views = useGatewayThreadViewStore();
  const first = events[0]!;
  const view = views.threadViews[threadViewKey(first.hostId, first.threadId)];
  if (!view) return;
  const fresh = events.filter((event) => event.id > view.lastEventId);
  if (!fresh.length) return;
  patchThreadView(first.hostId, first.threadId, {
    events: [...view.events, ...fresh].slice(-500),
    lastEventId: fresh.at(-1)!.id,
  });
}

function emptyThreadView(hostId: number, threadId: string): ThreadViewState {
  return {
    hostId,
    projectId: null,
    threadId,
    currentThread: null,
    history: null,
    events: [],
    olderTurnsCursor: null,
    newerTurnsCursor: null,
    lastEventId: 0,
    loading: false,
    error: null,
  };
}
