import type { ThreadOpenResult } from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { runtimeStatusFromThreadState } from "../thread-utils/status";
import type { ThreadSnapshotMessage } from "./transport";
import { retainThreadEvents } from "@/stores/gateway-thread-view/memory/events";
import { mergeThreadTurns } from "~~/shared/thread-history/turns";

export function applyThreadSnapshotResult(
  threadId: string,
  result: ThreadSnapshotMessage,
  replaceHistory = false,
) {
  const gateway = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const previousAppliedEventId = views.appliedEventId;
  const hadExistingHistory =
    !replaceHistory &&
    views.history?.thread.id === threadId &&
    views.eventEpoch === result.eventEpoch;
  const previousCursor = views.oldestTimelineCursor;
  views.currentThread = result.thread;
  // A same-generation activation is a recent page, not a replacement for pages the user opened.
  // Reuse the ordinary item-id merge so expanded content and its opaque pagination cursor survive
  // route switching. A server epoch change or explicit replay gap replaces the replica: missing
  // events mean an old "full" disclosure is no longer proof of completeness.
  views.setHistory(
    hadExistingHistory
      ? mergeThreadTurns(
          views.history,
          result.thread,
          threadId,
          result.history.thread.turns,
          "append",
        )
      : result.history,
  );
  navigation.selectedCwd = result.thread.cwd;
  navigation.selectedThreadId = threadId;
  if (result.project !== null && result.project !== undefined)
    gateway.mergeProjects([result.project]);
  applyCommonThreadResult(threadId, result, result.lastEventId);
  if (hadExistingHistory) views.oldestTimelineCursor = previousCursor;
  views.appliedEventId = hadExistingHistory ? (previousAppliedEventId ?? 0) : result.lastEventId;
  if (hadExistingHistory) {
    // A snapshot response carries the same bounded event tail as the initial open response. Apply
    // that tail before the next WebSocket notification arrives; otherwise switching back can paint
    // an older Agent message first and append its missing streamed text one frame later, moving the
    // virtual list and interrupting bottom-follow. A fresh page already received the materialized
    // history, so replaying its historical lifecycle events would incorrectly mark completed
    // threads as recently running.
    views.applyLiveEvents(result.recentEvents);
  }
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
  views.setHistory(result.history);
  views.appliedEventId = result.lastEventId;
  navigation.selectedThreadId = threadId;
  applyCommonThreadResult(threadId, result, result.lastEventId);
  navigation.selectedCwd = result.thread.cwd;
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
  views.events = retainThreadEvents(result.recentEvents);
  views.oldestTimelineCursor = result.oldestTimelineCursor;
  views.lastEventId = explicitLastEventId ?? result.recentEvents.at(-1)?.id ?? 0;
  views.eventEpoch = result.eventEpoch;
  views.readOnly = result.readOnly === true;
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
