import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { expectThreadSettingsSnapshot } from "@/stores/gateway-realtime/response-parsers";
import { pinnedKey, selectedThreadScope } from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";

const pendingRecoveries = new Map<string, Promise<void>>();

export function recoverSelectedThreadSettings() {
  if (useGatewayThreadViewStore().readOnly) return Promise.resolve();
  const navigation = useGatewayNavigationStore();
  const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
  if (scope === null) return Promise.resolve();

  const key = pinnedKey(scope.hostId, scope.threadId);
  const pending = pendingRecoveries.get(key);
  if (pending !== undefined) return pending;

  const sessionIsCurrent = captureSessionEpoch();
  const recovery = readThreadSettings(scope.hostId, scope.threadId)
    .then((threadSettings) => {
      if (!sessionIsCurrent()) return;
      const current = useGatewayNavigationStore();
      if (current.selectedHostId !== scope.hostId || current.selectedThreadId !== scope.threadId) {
        return;
      }
      useGatewayComposerStore().setThreadSettings(scope.hostId, scope.threadId, threadSettings);
    })
    .catch((error: unknown) => {
      // Recovery is opportunistic. The authoritative open and reconnect paths still surface
      // failures when they block user work, while focus events should not create toast loops.
      console.warn("[gateway] failed to refresh thread settings", error);
    })
    .finally(() => {
      if (pendingRecoveries.get(key) === recovery) pendingRecoveries.delete(key);
    });
  pendingRecoveries.set(key, recovery);
  return recovery;
}

function readThreadSettings(hostId: number, threadId: string) {
  return useGatewayRealtimeStore()
    .request(
      (requestId) => ({
        type: "thread.settings.read",
        requestId,
        hostId,
        threadId,
      }),
      expectThreadSettingsSnapshot,
      { timeoutMs: 120_000 },
    )
    .then((message) => message.threadSettings);
}
