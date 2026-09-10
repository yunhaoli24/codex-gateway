import type { ThreadOpenResult } from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import type { ThreadSnapshotMessage } from "./transport";

export function applyOpenedThreadResult(threadId: string, result: ThreadOpenResult) {
  const gateway = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  views.currentThread = result.thread;
  views.history = result.history;
  views.timelineTurns = result.history.thread.turns;
  if (result.projectId !== null && result.projectId !== undefined) {
    navigation.selectedProjectId = result.projectId;
  }
  navigation.selectedThreadId = threadId;
  useGatewayRealtimeStore().rememberThreadSubscription(
    result.hostId,
    threadId,
    result.lastEventId,
    result.eventEpoch,
  );
  if (result.project !== null && result.project !== undefined)
    gateway.mergeProjects([result.project]);
  applyCommonThreadResult(threadId, result, result.lastEventId);
  views.applyLiveEvents(result.recentEvents);
  syncRuntimeStatusFromResult(threadId, result, {
    thread: views.currentThread,
    history: views.history,
  });
  navigation.upsertPinnedMetadataFromThread(result.thread);
}

export function applyThreadSnapshotResult(threadId: string, result: ThreadSnapshotMessage) {
  const gateway = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  views.currentThread = result.thread;
  views.history = result.history;
  views.timelineTurns = result.history.thread.turns;
  if (result.projectId !== null && result.projectId !== undefined) {
    navigation.selectedProjectId = result.projectId;
  }
  navigation.selectedThreadId = threadId;
  if (result.project !== null && result.project !== undefined)
    gateway.mergeProjects([result.project]);
  applyCommonThreadResult(threadId, result, result.lastEventId);
  syncRuntimeStatusFromResult(threadId, result, {
    thread: views.currentThread,
    history: views.history,
  });
  navigation.upsertPinnedMetadataFromThread(result.thread);
}

export function applyStartedThreadResult(result: ThreadOpenResult) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const threadId = result.thread.id;
  views.currentThread = result.thread;
  views.history = result.history;
  views.timelineTurns = result.history.thread.turns;
  navigation.selectedThreadId = threadId;
  applyCommonThreadResult(threadId, result, result.lastEventId);
  return threadId;
}

function applyCommonThreadResult(
  threadId: string,
  result: ThreadOpenResult,
  explicitLastEventId?: number,
) {
  const gateway = useGatewayCatalogStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const views = useGatewayThreadViewStore();
  const hostId = result.hostId ?? navigation.selectedHostId;
  if (hostId === null) return;
  useGatewayThreadActivityStore().upsertGatewayThread(result.thread, gateway.projects);
  views.events = result.recentEvents;
  views.olderTurnsCursor = result.turnsPage.nextCursor;
  views.newerTurnsCursor = result.turnsPage.backwardsCursor;
  views.lastEventId = explicitLastEventId ?? result.recentEvents.at(-1)?.id ?? 0;
  views.eventEpoch = result.eventEpoch;
  // A metadata-only thread/read does not expose persisted model/effort. Null means unknown, not
  // "reset to model defaults", so a same-page thread switch must retain the last authoritative
  // thread/settings/updated projection already held by Pinia.
  if (result.threadSettings !== null && result.threadSettings !== undefined) {
    composer.setThreadSettings(hostId, threadId, result.threadSettings);
  }
  if (result.tokenUsage !== null && result.tokenUsage !== undefined) {
    runtime.setThreadTokenUsage(hostId, threadId, result.tokenUsage);
  } else syncTokenUsageFromRecentEvents(result.recentEvents);
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
  if (hostId === null || threadId === "") return;
  const status =
    result.runtimeStatus ??
    runtimeStatusFromThreadState(fallbackState.thread, fallbackState.history);
  if (status !== null) useGatewayThreadRuntimeStore().setThreadStatus(hostId, threadId, status);
}

function syncTokenUsageFromRecentEvents(events: ThreadOpenResult["recentEvents"]) {
  const runtime = useGatewayThreadRuntimeStore();
  for (const event of events) {
    const canonical = event.event;
    if (canonical.type !== "thread.usage.updated") continue;
    const tokenUsage = normalizeTokenUsage(canonical.tokenUsage);
    if (tokenUsage !== null && event.hostId !== null) {
      runtime.setThreadTokenUsage(event.hostId, event.threadId, tokenUsage);
    }
  }
}
