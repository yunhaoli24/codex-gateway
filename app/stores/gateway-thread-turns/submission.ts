import type { ComposerTurnOptions } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import {
  createClientUserMessageId,
  optimisticUserContent,
} from "@/stores/gateway/thread-turns/turn-content";
import {
  insertOptimisticNewTurnMessage,
  insertOptimisticSteerMessage,
  mergeStartedTurn,
  mergeTurnItems,
} from "./history";
import { runTurnRequestWithAutoRetry } from "./retry";
import { requestTurnStart, requestTurnSteer } from "./transport";
import type { Translate, TurnRequestResult } from "./types";

export async function sendTurn(t: Translate, text: string, options: ComposerTurnOptions = {}) {
  const gateway = useGatewayStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const runtimeStore = useGatewayThreadRuntimeStore();
  const views = useGatewayThreadViewStore();
  const hostId = navigation.selectedHostId;
  const threadId = navigation.selectedThreadId;
  if (!hostId || !threadId) {
    return;
  }

  const runtime = runtimeStore.threadRuntimeProjection(hostId, threadId);
  const steerTurnId = runtime.canSteer ? runtime.activeTurnId : null;
  const shouldSteerActiveTurn = Boolean(steerTurnId);
  const clientUserMessageId = createClientUserMessageId(shouldSteerActiveTurn ? "steer" : "turn");
  if (!shouldSteerActiveTurn) {
    runtimeStore.setThreadRunning(hostId, threadId, true);
  }

  const optimisticContent = optimisticUserContent(text, options);
  if (steerTurnId) {
    insertOptimisticSteerMessage(threadId, steerTurnId, clientUserMessageId, optimisticContent);
  } else {
    insertOptimisticNewTurnMessage(threadId, clientUserMessageId, optimisticContent);
  }

  const projectId = navigation.selectedProjectId;
  const cwd = gateway.projects.find((project) => project.id === projectId)?.remotePath ?? null;
  const requestKind = shouldSteerActiveTurn ? "steer" : "start";
  const executeTurnRequest = steerTurnId
    ? () =>
        requestTurnSteer({
          hostId,
          threadId,
          expectedTurnId: steerTurnId,
          text,
          clientUserMessageId,
          options,
        })
    : () => requestTurnStart({ hostId, threadId, text, clientUserMessageId, cwd, options });

  views.loading = true;
  gateway.clearError();
  try {
    const result = await runTurnRequestWithAutoRetry<TurnRequestResult>(
      t,
      { kind: requestKind, hostId, projectId, threadId, cwd, text, options },
      executeTurnRequest,
    );
    applyAcceptedTurnResult(hostId, threadId, result, clientUserMessageId, optimisticContent);
    if (!shouldSteerActiveTurn) {
      composer.updateSelectedThreadSettings({
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.effort !== undefined ? { effort: options.effort } : {}),
        ...(options.approvalPolicy !== undefined ? { approvalPolicy: options.approvalPolicy } : {}),
      });
    }
  } catch (error: unknown) {
    useGatewayThreadTurnsStore().clearRequest(hostId, threadId);
    gateway.setError(messageFromError(error, t("app.sendMessageFailed"), errorMessageLabels(t)), {
      hostId,
      projectId,
      threadId,
    });
    if (!shouldSteerActiveTurn) {
      runtimeStore.setThreadStatus(hostId, threadId, "completed");
    }
  } finally {
    views.loading = false;
  }
}

function applyAcceptedTurnResult(
  hostId: number,
  threadId: string,
  result: TurnRequestResult | undefined,
  clientUserMessageId: string,
  optimisticContent: unknown[],
) {
  const runtime = useGatewayThreadRuntimeStore();
  if (result?.type === "turn.start.accepted" && result.turn) {
    const startedTurnId = result.turn?.id ? String(result.turn.id) : "";
    if (startedTurnId && !startedTurnId.startsWith("client-")) {
      runtime.setThreadStatus(hostId, threadId, "running", { turnId: startedTurnId });
    }
    mergeStartedTurn(threadId, result.turn);
  }
  if (result?.type === "turn.start.accepted" && result.turn?.items?.length) {
    mergeTurnItems(threadId, result.turn);
  }
  if (result?.type === "turn.steer.accepted" && result.turnId) {
    insertOptimisticSteerMessage(threadId, result.turnId, clientUserMessageId, optimisticContent);
  }
}
