import type { GatewayEvent, ThreadHistoryState, ThreadTimelineHistoryState } from "~~/shared/types";
import { CLIENT_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { retainThreadHistory } from "~~/shared/thread-history/retention";
import { retainThreadEvents } from "@/stores/gateway-thread-view/memory/events";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey } from "../thread-utils/identity";
import type { ThreadViewState } from "../types";
import { threadViewSubscriptionLeases } from "./thread-view-subscription-leases";

export function threadViewKey(hostId: number, threadId: string) {
  return pinnedKey(hostId, threadId);
}

export function selectedThreadViewKey() {
  const navigation = useGatewayNavigationStore();
  return navigation.selectedHostId !== null && navigation.selectedThreadId !== null
    ? threadViewKey(navigation.selectedHostId, navigation.selectedThreadId)
    : null;
}

export function selectedThreadView() {
  const views = useGatewayThreadViewStore();
  const key = selectedThreadViewKey();
  return key === null ? null : (views.threadViews[key] ?? null);
}

export function upsertThreadView(view: ThreadViewState) {
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(view.hostId, view.threadId);
  const { [key]: _existing, ...remaining } = views.threadViews;
  const retainedHistory = retainThreadHistory(
    view.history,
    views.expandedTurnId(view.hostId, view.threadId),
  );
  const retainedView =
    retainedHistory === view.history ? view : { ...view, ...projectionFields(retainedHistory) };
  // Removing and reinserting the key makes plain object insertion order our LRU order. This keeps
  // the policy colocated with the only cache write boundary instead of maintaining a second list.
  views.threadViews = pruneThreadViews({
    ...remaining,
    [key]: { ...retainedView, events: retainThreadEvents(retainedView.events) },
  });
}

function pruneThreadViews(threadViews: Record<string, ThreadViewState>) {
  const views = useGatewayThreadViewStore();
  const protectedKeys = new Set<string>();
  const selectedKey = selectedThreadViewKey();
  if (selectedKey !== null) protectedKeys.add(selectedKey);
  for (const panel of views.subAgentPanels) {
    protectedKeys.add(threadViewKey(panel.hostId, panel.threadId));
  }
  const entries = Object.entries(threadViews);
  while (entries.length > CLIENT_THREAD_CACHE_LIMIT) {
    const index = entries.findIndex(([key]) => !protectedKeys.has(key));
    if (index < 0) break;
    const [, evicted] = entries.splice(index, 1)[0]!;
    threadViewSubscriptionLeases.release(evicted.hostId, evicted.threadId);
  }
  return Object.fromEntries(entries);
}

type ThreadViewPatch = Omit<Partial<ThreadViewState>, "history"> & {
  history?: ThreadHistoryState | null;
};

export function patchThreadView(hostId: number, threadId: string, patch: ThreadViewPatch) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(hostId, threadId);
  const existing = views.threadViews[key] ?? emptyThreadView(hostId, threadId);
  // History is already projected at the reducer boundary. Route switches restore this same object
  // instead of maintaining a second timeline-turns array that can drift from it.
  const projectedPatch =
    "history" in patch ? projectionFields(patch.history ?? null) : { history: existing.history };
  const next = { ...existing, ...patch, ...projectedPatch, hostId, threadId };
  upsertThreadView(next);
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    activateThreadViewFromCache(hostId, threadId);
  }
  return next;
}

export function setSelectedThreadHistory(history: ThreadHistoryState | null) {
  useGatewayThreadViewStore().setHistory(history);
}

export function activateThreadViewFromCache(hostId: number, threadId: string) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const view = views.threadViews[threadViewKey(hostId, threadId)];
  if (view === undefined) return false;
  // Route changes are selection only: restore the already-projected Pinia references. Do not call
  // setHistory() here, because remounting Agent for Dockview must not rescan a large cached thread.
  navigation.selectedHostId = view.hostId;
  navigation.selectedProjectId = view.projectId;
  navigation.selectedThreadId = view.threadId;
  views.currentThread = view.currentThread;
  views.history = view.history;
  views.events = [...view.events];
  views.oldestTimelineCursor = view.oldestTimelineCursor;
  views.lastEventId = view.lastEventId;
  views.appliedEventId = view.appliedEventId ?? view.lastEventId;
  views.eventEpoch = view.eventEpoch;
  return true;
}

export function saveSelectedThreadView() {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (
    navigation.selectedHostId === null ||
    navigation.selectedThreadId === null ||
    views.currentThread === null ||
    views.history === null
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
    oldestTimelineCursor: views.oldestTimelineCursor,
    lastEventId: views.lastEventId,
    appliedEventId: views.appliedEventId,
    eventEpoch: views.eventEpoch,
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
  if (_removed !== undefined) threadViewSubscriptionLeases.release(hostId, threadId);
}

export function appendEventToThreadView(event: GatewayEvent) {
  appendEventsToThreadView([event]);
}

export function appendEventsToThreadView(events: GatewayEvent[]) {
  if (events.length === 0) return;
  const views = useGatewayThreadViewStore();
  const first = events[0]!;
  const view = views.threadViews[threadViewKey(first.hostId, first.threadId)];
  if (view === undefined) return;
  const fresh = events.filter((event) => event.id > view.lastEventId);
  if (fresh.length === 0) return;
  patchThreadView(first.hostId, first.threadId, {
    events: retainThreadEvents([...view.events, ...fresh]),
    lastEventId: fresh.at(-1)!.id,
  });
}

export function markThreadEventsApplied(events: GatewayEvent[]) {
  if (events.length === 0) return;
  const views = useGatewayThreadViewStore();
  const first = events[0]!;
  const view = views.threadViews[threadViewKey(first.hostId, first.threadId)];
  if (view === undefined) return;
  patchThreadView(first.hostId, first.threadId, {
    appliedEventId: Math.max(
      view.appliedEventId ?? view.lastEventId,
      ...events.map((event) => event.id),
    ),
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
    oldestTimelineCursor: null,
    lastEventId: 0,
    appliedEventId: 0,
    eventEpoch: "",
    loading: false,
    error: null,
  };
}

function projectionFields(history: ThreadHistoryState | null): {
  history: ThreadTimelineHistoryState | null;
} {
  if (history === null) return { history: null };
  const projected = projectThreadTimelineHistory(history);
  return { history: projected };
}
