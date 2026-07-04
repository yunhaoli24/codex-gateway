import { useGatewayStore } from "@/stores/gateway";
import {
  errorMessageLabels,
  messageFromError,
  pinnedKey,
} from "@/stores/gateway/thread-utils/identity";
import { projectThreadRuntimeFromState } from "@/stores/gateway/thread-runtime/projector";
import { activeRemoteTurnId } from "@/stores/gateway/thread-turns/active-turn";
import { requestTurnInterrupt } from "./transport";
import { historyForThread } from "./history";
import type { Translate } from "./types";

export async function interruptActiveTurn(t: Translate) {
  const gateway = useGatewayStore();
  if (!gateway.selectedHostId || !gateway.selectedThreadId) {
    return;
  }
  await interruptThreadTurn(t, {
    hostId: gateway.selectedHostId,
    projectId: gateway.selectedProjectId,
    threadId: gateway.selectedThreadId,
  });
}

export async function interruptThreadTurn(
  t: Translate,
  input: { hostId: number; threadId: string; projectId?: number | null },
) {
  const gateway = useGatewayStore();
  const projectId = input.projectId ?? null;
  const turnId = projectThreadRuntimeFromState(gateway, input.hostId, input.threadId).activeTurnId;
  if (!turnId) {
    gateway.setThreadStatus(input.hostId, input.threadId, "completed");
    gateway.setError(noActiveTurnToInterruptMessage(t, input.hostId, input.threadId), {
      hostId: input.hostId,
      projectId,
      threadId: input.threadId,
    });
    return;
  }

  gateway.loading = true;
  gateway.clearError();
  try {
    await requestTurnInterrupt(input.hostId, input.threadId, turnId);
  } catch (error: any) {
    gateway.setError(messageFromError(error, t("app.interruptTurnFailed"), errorMessageLabels(t)), {
      hostId: input.hostId,
      projectId,
      threadId: input.threadId,
    });
  } finally {
    gateway.loading = false;
  }
}

function noActiveTurnToInterruptMessage(t: Translate, hostId: number, threadId: string) {
  const gateway = useGatewayStore();
  const history = historyForThread(hostId, threadId);
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  const lastTurn = turns[turns.length - 1];
  const key = pinnedKey(hostId, threadId);
  return [
    t("app.noActiveTurnToInterrupt"),
    `hostId=${hostId}`,
    `threadId=${threadId}`,
    `runtimeStatus=${gateway.threadStatuses[key] ?? "unknown"}`,
    `storedActiveTurnId=${gateway.activeTurnIdsByThreadKey[key] ?? "none"}`,
    `historyActiveTurnId=${activeRemoteTurnId(history) ?? "none"}`,
    `lastTurnId=${lastTurn?.id ?? "none"}`,
    `lastTurnStatus=${JSON.stringify(lastTurn?.status ?? null)}`,
  ].join("\n");
}
