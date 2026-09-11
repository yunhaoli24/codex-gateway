import type { GatewayEvent, ThreadHistoryState } from "~~/shared/types";
import { CLIENT_THREAD_CACHE_LIMIT } from "~~/shared/config";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { retainRecentThreadTurns } from "~~/shared/thread-history/retention";
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
  const retainedHistory = retainRecentThreadTurns(view.history);
  const retainedView =
    retainedHistory === view.history ? view : { ...view, ...projectionFields(retainedHistory) };
  // Removing and reinserting the key makes plain object insertion order our LRU order. This keeps
  // the policy colocated with the only cache write boundary instead of maintaining a second list.
  views.threadViews = pruneThreadViews({ ...remaining, [key]: retainedView });
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

export function patchThreadView(hostId: number, threadId: string, patch: Partial<ThreadViewState>) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const key = threadViewKey(hostId, threadId);
  const existing = views.threadViews[key] ?? emptyThreadView(hostId, threadId);
  // history and timelineTurns are one cache invariant. Realtime events also update background
  // threads, so accepting a history-only patch without rebuilding its projection would make the
  // next route switch restore stale rows. Patches unrelated to history preserve both references.
  const projectedPatch =
    "history" in patch
      ? projectionFields(patch.history ?? null)
      : { history: existing.history, timelineTurns: existing.timelineTurns };
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
  views.timelineTurns = view.timelineTurns;
  views.events = [...view.events];
  views.olderTurnsCursor = view.olderTurnsCursor;
  views.newerTurnsCursor = view.newerTurnsCursor;
  views.lastEventId = view.lastEventId;
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
    timelineTurns: views.timelineTurns,
    events: [...views.events],
    olderTurnsCursor: views.olderTurnsCursor,
    newerTurnsCursor: views.newerTurnsCursor,
    lastEventId: views.lastEventId,
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
    timelineTurns: [],
    events: [],
    olderTurnsCursor: null,
    newerTurnsCursor: null,
    lastEventId: 0,
    eventEpoch: "",
    loading: false,
    error: null,
  };
}

function projectionFields(history: ThreadHistoryState | null) {
  if (history === null) return { history: null, timelineTurns: [] };
  const projected = projectThreadTimelineHistory(retainRecentThreadTurns(history)!);
  return { history: projected, timelineTurns: projected.thread.turns };
}
