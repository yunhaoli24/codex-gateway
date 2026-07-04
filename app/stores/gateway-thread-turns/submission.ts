import type { ComposerTurnOptions } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { projectThreadRuntimeFromState } from "@/stores/gateway/thread-runtime/projector";
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
  const hostId = gateway.selectedHostId;
  const threadId = gateway.selectedThreadId;
  if (!hostId || !threadId) {
    return;
  }

  const runtime = projectThreadRuntimeFromState(gateway, hostId, threadId);
  const steerTurnId = runtime.canSteer ? runtime.activeTurnId : null;
  const shouldSteerActiveTurn = Boolean(steerTurnId);
  const clientUserMessageId = createClientUserMessageId(shouldSteerActiveTurn ? "steer" : "turn");
  if (!shouldSteerActiveTurn) {
    gateway.setThreadRunning(hostId, threadId, true);
  }

  const optimisticContent = optimisticUserContent(text, options);
  if (steerTurnId) {
    insertOptimisticSteerMessage(threadId, steerTurnId, clientUserMessageId, optimisticContent);
  } else {
    insertOptimisticNewTurnMessage(threadId, clientUserMessageId, optimisticContent);
  }

  const projectId = gateway.selectedProjectId;
  const cwd = gateway.selectedProject?.remotePath ?? null;
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

  gateway.loading = true;
  gateway.clearError();
  try {
    const result = await runTurnRequestWithAutoRetry<TurnRequestResult>(
      t,
      { kind: requestKind, hostId, projectId, threadId, cwd, text, options },
      executeTurnRequest,
    );
    applyAcceptedTurnResult(hostId, threadId, result, clientUserMessageId, optimisticContent);
    if (!shouldSteerActiveTurn) {
      gateway.updateSelectedThreadSettings({
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.effort !== undefined ? { effort: options.effort } : {}),
        ...(options.approvalPolicy !== undefined ? { approvalPolicy: options.approvalPolicy } : {}),
      });
    }
  } catch (error: any) {
    useGatewayThreadTurnsStore().clearRequest(hostId, threadId);
    gateway.setError(messageFromError(error, t("app.sendMessageFailed"), errorMessageLabels(t)), {
      hostId,
      projectId,
      threadId,
    });
    if (!shouldSteerActiveTurn) {
      gateway.setThreadStatus(hostId, threadId, "completed");
    }
  } finally {
    gateway.loading = false;
  }
}

function applyAcceptedTurnResult(
  hostId: number,
  threadId: string,
  result: TurnRequestResult | undefined,
  clientUserMessageId: string,
  optimisticContent: any[],
) {
  const gateway = useGatewayStore();
  if (result?.type === "turn.start.accepted" && result.turn) {
    const startedTurnId = result.turn?.id ? String(result.turn.id) : "";
    if (startedTurnId && !startedTurnId.startsWith("client-")) {
      gateway.setThreadStatus(hostId, threadId, "running", { turnId: startedTurnId });
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
