import type { ComposerTurnOptions } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { activeRemoteTurnId } from "../thread-turns/active-turn";
import {
  mergeStartedTurn,
  mergeTurnItems,
  insertOptimisticNewTurnMessage,
  insertOptimisticSteerMessage,
} from "../thread-turns/optimistic-history";
import { loadOlderTurns } from "../thread-turns/older-turns";
import { flushPendingSteers, queuePendingSteer } from "../thread-turns/pending-steers";
import {
  clearSubmittedTurnRequest,
  maybeQueueServerOverloadedRetry,
  maybeRetryAfterTurnFailure,
  rememberSubmittedTurnRequest,
  runTurnRequestWithAutoRetry,
} from "../thread-turns/retry";
import { respondToServerRequest } from "../thread-turns/server-requests";
import { createClientUserMessageId, optimisticUserContent } from "../thread-turns/turn-content";
import {
  interruptActiveTurn as sendTurnInterrupt,
  startNewTurn,
  steerActiveTurn,
} from "../thread-turns/turn-transport";

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
      const cwd = ctx.selectedProject?.remotePath ?? null;
      const requestKind = shouldSteerActiveTurn ? "steer" : "start";
      ctx.state.loading = true;
      ctx.clearError();
      try {
        const result = await runTurnRequestWithAutoRetry(
          ctx,
          {
            kind: requestKind,
            hostId,
            projectId,
            threadId,
            cwd,
            text,
            options,
          },
          () =>
            shouldSteerActiveTurn
              ? steerActiveTurn(ctx, text, clientUserMessageId, expectedSteerTurnId!, options)
              : startNewTurn(ctx, text, clientUserMessageId, options),
        );
        rememberSubmittedTurnRequest(ctx, {
          kind: requestKind,
          hostId,
          projectId,
          threadId,
          cwd,
          text,
          options,
        });
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
        clearSubmittedTurnRequest(ctx, hostId, threadId);
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

    async interruptActiveTurn() {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const hostId = ctx.state.selectedHostId;
      const threadId = ctx.state.selectedThreadId;
      const key = pinnedKey(hostId, threadId);
      const turnId =
        activeRemoteTurnId(ctx.state.history) ?? ctx.state.activeTurnIdsByThreadKey[key];
      if (!turnId) {
        ctx.setError(ctx.t("app.noActiveTurnToInterrupt"), {
          hostId,
          projectId: ctx.state.selectedProjectId,
          threadId,
        });
        return;
      }
      ctx.state.loading = true;
      ctx.clearError();
      try {
        await sendTurnInterrupt(ctx, turnId);
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.interruptTurnFailed"), ctx.errorLabels), {
          hostId,
          projectId: ctx.state.selectedProjectId,
          threadId,
        });
      } finally {
        ctx.state.loading = false;
      }
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

    async respondToServerRequest(
      hostId: number,
      threadId: string,
      requestId: string | number,
      result: unknown,
    ) {
      await respondToServerRequest(ctx, hostId, threadId, requestId, result);
    },

    maybeQueueServerOverloadedRetry(hostId: number, threadId: string, turnId: string, error: any) {
      return maybeQueueServerOverloadedRetry(ctx, hostId, threadId, turnId, error);
    },

    maybeRetryAfterTurnFailure(hostId: number, threadId: string, turn: Record<string, any>) {
      maybeRetryAfterTurnFailure(ctx, hostId, threadId, turn);
    },

    clearSubmittedTurnRequest(hostId: number, threadId: string) {
      clearSubmittedTurnRequest(ctx, hostId, threadId);
    },
  };
}
