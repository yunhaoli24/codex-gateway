import type { ComposerTurnOptions } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError } from "../thread-utils/identity";
import { activeRemoteTurnId } from "../thread-turns/active-turn";
import {
  mergeStartedTurn,
  mergeTurnItems,
  insertOptimisticNewTurnMessage,
  insertOptimisticSteerMessage,
} from "../thread-turns/optimistic-history";
import { loadOlderTurns } from "../thread-turns/older-turns";
import { flushPendingSteers, queuePendingSteer } from "../thread-turns/pending-steers";
import { respondToServerRequest } from "../thread-turns/server-requests";
import { createClientUserMessageId, optimisticUserContent } from "../thread-turns/turn-content";
import { startNewTurn, steerActiveTurn } from "../thread-turns/turn-transport";

export function createThreadTurnActions(ctx: GatewayStoreContext) {
  return {
    async sendTurn(text: string, options: ComposerTurnOptions = {}) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const expectedSteerTurnId = activeRemoteTurnId(ctx.state.history);
      const shouldSteerActiveTurn =
        ctx.selectedThreadStatus === "running" || Boolean(expectedSteerTurnId);
      const clientUserMessageId = createClientUserMessageId(
        shouldSteerActiveTurn ? "steer" : "turn",
      );
      if (!shouldSteerActiveTurn) {
        ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, true);
      }
      const optimisticContent = optimisticUserContent(text, options);
      if (shouldSteerActiveTurn) {
        if (!expectedSteerTurnId) {
          ctx.queuePendingSteer(ctx.state.selectedHostId, ctx.state.selectedThreadId, {
            text,
            clientUserMessageId,
            content: optimisticContent,
            images: options.images ?? [],
          });
          void ctx.flushPendingSteers(ctx.state.selectedHostId, ctx.state.selectedThreadId);
          return;
        }
        insertOptimisticSteerMessage(
          ctx,
          ctx.state.selectedThreadId,
          expectedSteerTurnId,
          clientUserMessageId,
          optimisticContent,
        );
      } else {
        insertOptimisticNewTurnMessage(
          ctx,
          ctx.state.selectedThreadId,
          clientUserMessageId,
          optimisticContent,
        );
      }
      const hostId = ctx.state.selectedHostId;
      const threadId = ctx.state.selectedThreadId;
      const projectId = ctx.state.selectedProjectId;
      ctx.state.loading = true;
      ctx.clearError();
      try {
        const result = shouldSteerActiveTurn
          ? await steerActiveTurn(ctx, text, clientUserMessageId, expectedSteerTurnId!, options)
          : await startNewTurn(ctx, text, clientUserMessageId, options);
        if (!shouldSteerActiveTurn && result?.turn) {
          mergeStartedTurn(ctx, ctx.state.selectedThreadId, result.turn);
          void ctx.flushPendingSteers(ctx.state.selectedHostId, ctx.state.selectedThreadId);
        }
        if (result?.turn?.items?.length) {
          mergeTurnItems(ctx, ctx.state.selectedThreadId, result.turn);
        }
        if (shouldSteerActiveTurn && result?.turnId) {
          insertOptimisticSteerMessage(
            ctx,
            ctx.state.selectedThreadId,
            result.turnId,
            clientUserMessageId,
            optimisticContent,
          );
        }
        if (!shouldSteerActiveTurn) {
          ctx.updateSelectedThreadSettings({
            ...(options.model !== undefined ? { model: options.model } : {}),
            ...(options.effort !== undefined ? { effort: options.effort } : {}),
            ...(options.approvalPolicy !== undefined
              ? { approvalPolicy: options.approvalPolicy }
              : {}),
          });
        }
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.sendMessageFailed"), ctx.errorLabels), {
          hostId,
          projectId,
          threadId,
        });
        if (!shouldSteerActiveTurn) {
          ctx.setThreadStatus(ctx.state.selectedHostId, ctx.state.selectedThreadId, "completed", {
            notifyTerminal: false,
          });
        }
      } finally {
        ctx.state.loading = false;
      }
    },

    async loadOlderTurns() {
      await loadOlderTurns(ctx);
    },

    queuePendingSteer(
      hostId: number,
      threadId: string,
      steer: {
        text: string;
        clientUserMessageId: string;
        content: any[];
        images: ComposerTurnOptions["images"];
      },
    ) {
      queuePendingSteer(ctx, hostId, threadId, steer);
    },

    async flushPendingSteers(hostId: number, threadId: string) {
      await flushPendingSteers(ctx, hostId, threadId);
    },

    async respondToServerRequest(threadId: string, requestId: string | number, result: unknown) {
      await respondToServerRequest(ctx, threadId, requestId, result);
    },
  };
}
