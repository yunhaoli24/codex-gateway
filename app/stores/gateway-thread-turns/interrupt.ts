import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import {
  errorMessageLabels,
  messageFromError,
  pinnedKey,
} from "@/stores/gateway/thread-utils/identity";
import { activeRemoteTurnId } from "@/stores/gateway/thread-turns/active-turn";
import { requestTurnInterrupt } from "./transport";
import { historyForThread } from "./history";
import type { Translate } from "./types";

export async function interruptActiveTurn(t: Translate) {
  const navigation = useGatewayNavigationStore();
  if (!navigation.selectedHostId || !navigation.selectedThreadId) {
    return;
  }
  await interruptThreadTurn(t, {
    hostId: navigation.selectedHostId,
    projectId: navigation.selectedProjectId,
    threadId: navigation.selectedThreadId,
  });
}

export async function interruptThreadTurn(
  t: Translate,
  input: { hostId: number; threadId: string; projectId?: number | null },
) {
  const gateway = useGatewayStore();
  const runtime = useGatewayThreadRuntimeStore();
  const views = useGatewayThreadViewStore();
  const projectId = input.projectId ?? null;
  const turnId = runtime.threadRuntimeProjection(input.hostId, input.threadId).activeTurnId;
  if (!turnId) {
    runtime.setThreadStatus(input.hostId, input.threadId, "completed");
    gateway.setError(noActiveTurnToInterruptMessage(t, input.hostId, input.threadId), {
      hostId: input.hostId,
      projectId,
      threadId: input.threadId,
    });
    return;
  }

  views.loading = true;
  gateway.clearError();
  try {
    await requestTurnInterrupt(input.hostId, input.threadId, turnId);
  } catch (error: unknown) {
    gateway.setError(messageFromError(error, t("app.interruptTurnFailed"), errorMessageLabels(t)), {
      hostId: input.hostId,
      projectId,
      threadId: input.threadId,
    });
  } finally {
    views.loading = false;
  }
}

function noActiveTurnToInterruptMessage(t: Translate, hostId: number, threadId: string) {
  const runtime = useGatewayThreadRuntimeStore();
  const history = historyForThread(hostId, threadId);
  const turns = threadTurnsFromHistory(history);
  const lastTurn = turns[turns.length - 1];
  const key = pinnedKey(hostId, threadId);
  return [
    t("app.noActiveTurnToInterrupt"),
    `hostId=${hostId}`,
    `threadId=${threadId}`,
    `runtimeStatus=${runtime.threadStatuses[key] ?? "unknown"}`,
    `storedActiveTurnId=${runtime.activeTurnIdsByThreadKey[key] ?? "none"}`,
    `historyActiveTurnId=${activeRemoteTurnId(history) ?? "none"}`,
    `lastTurnId=${lastTurn?.id ?? "none"}`,
    `lastTurnStatus=${JSON.stringify(lastTurn?.status ?? null)}`,
  ].join("\n");
}
