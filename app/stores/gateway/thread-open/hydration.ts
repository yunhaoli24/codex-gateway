import type { ThreadOpenResult } from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { threadIdFromParams } from "../thread-utils/identity";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import type { ThreadSnapshotMessage } from "./transport";

export function applyOpenedThreadResult(threadId: string, result: ThreadOpenResult) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  views.currentThread = result.thread;
  views.history = result.history;
  if (result.projectId) navigation.selectedProjectId = result.projectId;
  navigation.selectedThreadId = threadId;
  useGatewayRealtimeStore().rememberThreadSubscription(result.hostId, threadId, result.lastEventId);
  if (result.project) gateway.mergeProjects([result.project]);
  applyCommonThreadResult(threadId, result);
  for (const event of result.recentEvents) views.applyLiveEvent(event);
  syncRuntimeStatusFromResult(threadId, result, {
    thread: views.currentThread,
    history: views.history,
  });
  navigation.upsertPinnedMetadataFromThread(result.thread as any);
}

export function applyThreadSnapshotResult(threadId: string, result: ThreadSnapshotMessage) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  views.currentThread = result.thread;
  views.history = result.history;
  if (result.projectId) navigation.selectedProjectId = result.projectId;
  navigation.selectedThreadId = threadId;
  if (result.project) gateway.mergeProjects([result.project]);
  applyCommonThreadResult(threadId, result, result.lastEventId);
  syncRuntimeStatusFromResult(threadId, result, {
    thread: views.currentThread,
    history: views.history,
  });
  navigation.upsertPinnedMetadataFromThread(result.thread as any);
}

export function applyStartedThreadResult(result: ThreadOpenResult) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const threadId = String((result.thread as any).id);
  views.currentThread = result.thread;
  views.history = result.history;
  navigation.selectedThreadId = threadId;
  applyCommonThreadResult(threadId, result);
  return threadId;
}

function applyCommonThreadResult(
  threadId: string,
  result: ThreadOpenResult,
  explicitLastEventId?: number,
) {
  const gateway = useGatewayStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const views = useGatewayThreadViewStore();
  const hostId = result.hostId || navigation.selectedHostId;
  if (!hostId) return;
  useGatewayThreadActivityStore().upsertThread(hostId, result.thread, gateway.projects);
  views.events = result.recentEvents;
  views.olderTurnsCursor = result.turnsPage.nextCursor;
  views.newerTurnsCursor = result.turnsPage.backwardsCursor;
  views.lastEventId = explicitLastEventId ?? result.recentEvents.at(-1)?.id ?? 0;
  composer.setThreadSettings(hostId, threadId, result.threadSettings);
  if (result.tokenUsage) runtime.setThreadTokenUsage(hostId, threadId, result.tokenUsage);
  else syncTokenUsageFromRecentEvents(result.recentEvents);
  syncRuntimeStatusFromResult(threadId, result);
}

function syncRuntimeStatusFromResult(
  threadId: string,
  result: ThreadOpenResult,
  fallbackState: { thread: unknown; history: unknown } = {
    thread: result.thread,
    history: result.history,
  },
) {
  const hostId = useGatewayNavigationStore().selectedHostId;
  if (!hostId || !threadId) return;
  const status =
    result.runtimeStatus ??
    runtimeStatusFromThreadState(fallbackState.thread, fallbackState.history);
  if (status) useGatewayThreadRuntimeStore().setThreadStatus(hostId, threadId, status);
}

function syncTokenUsageFromRecentEvents(events: ThreadOpenResult["recentEvents"]) {
  const runtime = useGatewayThreadRuntimeStore();
  for (const event of events) {
    if (event.method !== "thread/tokenUsage/updated") continue;
    const params = (event.payload as any)?.params || {};
    const threadId = threadIdFromParams(params);
    const tokenUsage = normalizeTokenUsage(params.tokenUsage);
    if (threadId && event.hostId && tokenUsage) {
      runtime.setThreadTokenUsage(event.hostId, String(threadId), tokenUsage);
    }
  }
}
