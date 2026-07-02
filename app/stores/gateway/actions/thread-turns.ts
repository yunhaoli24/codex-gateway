import type { ComposerTurnOptions } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { activeRemoteTurnId, activeTurnIdFromRuntimeState } from "../thread-turns/active-turn";
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
  requestTurnInterrupt,
  startNewTurn,
  steerActiveTurn,
} from "../thread-turns/turn-transport";

export function createThreadTurnActions(ctx: GatewayStoreContext) {
  return {
    async sendTurn(text: string, options: ComposerTurnOptions = {}) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const key = pinnedKey(ctx.state.selectedHostId, ctx.state.selectedThreadId);
      const expectedSteerTurnId = activeTurnIdFromRuntimeState(
        ctx.state.history,
        ctx.state.activeTerminalProcessByThreadKey[key]?.turnId,
      );
      const threadIsRunning = ctx.selectedThreadStatus === "running";
      const shouldSteerActiveTurn = threadIsRunning && Boolean(expectedSteerTurnId);
      const shouldQueueSteer = threadIsRunning && !expectedSteerTurnId;
      const clientUserMessageId = createClientUserMessageId(threadIsRunning ? "steer" : "turn");
      if (!threadIsRunning) {
        ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, true);
      }
      const optimisticContent = optimisticUserContent(text, options);
      if (shouldSteerActiveTurn) {
        insertOptimisticSteerMessage(
          ctx,
          ctx.state.selectedThreadId,
          expectedSteerTurnId,
          clientUserMessageId,
          optimisticContent,
        );
      } else if (shouldQueueSteer) {
        queuePendingSteer(ctx, ctx.state.selectedHostId, ctx.state.selectedThreadId, {
          text,
          clientUserMessageId,
          content: optimisticContent,
          images: options.images,
        });
        void ctx.flushPendingSteers(ctx.state.selectedHostId, ctx.state.selectedThreadId);
        return;
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
          const startedTurnId = result.turn?.id ? String(result.turn.id) : "";
          if (startedTurnId && !startedTurnId.startsWith("client-")) {
            ctx.setThreadStatus(hostId, threadId, "running", { turnId: startedTurnId });
          }
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
        if (!threadIsRunning) {
          ctx.setThreadStatus(hostId, threadId, "completed");
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
      await interruptThreadTurn(ctx, {
        hostId,
        projectId: ctx.state.selectedProjectId,
        threadId,
        selectedTransport: true,
      });
    },

    async interruptThreadTurn(input: {
      hostId: number;
      threadId: string;
      projectId?: number | null;
    }) {
      await interruptThreadTurn(ctx, {
        hostId: input.hostId,
        projectId: input.projectId ?? null,
        threadId: input.threadId,
        selectedTransport: false,
      });
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

async function interruptThreadTurn(
  ctx: GatewayStoreContext,
  input: {
    hostId: number;
    projectId: number | null;
    threadId: string;
    selectedTransport: boolean;
  },
) {
  const turnId = activeTurnIdForThread(ctx, input.hostId, input.threadId);
  if (!turnId) {
    ctx.setThreadStatus(input.hostId, input.threadId, "completed");
    ctx.setError(noActiveTurnToInterruptMessage(ctx, input.hostId, input.threadId), {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
    });
    return;
  }

  ctx.state.loading = true;
  ctx.clearError();
  try {
    if (input.selectedTransport) {
      await sendTurnInterrupt(ctx, turnId);
      return;
    }
    await requestTurnInterrupt(ctx, {
      hostId: input.hostId,
      threadId: input.threadId,
      turnId,
    });
  } catch (error: any) {
    ctx.setError(messageFromError(error, ctx.t("app.interruptTurnFailed"), ctx.errorLabels), {
      hostId: input.hostId,
      projectId: input.projectId,
      threadId: input.threadId,
    });
  } finally {
    ctx.state.loading = false;
  }
}

function activeTurnIdForThread(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const key = pinnedKey(hostId, threadId);
  return (
    activeRemoteTurnId(historyForThread(ctx, hostId, threadId)) ??
    ctx.state.activeTerminalProcessByThreadKey[key]?.turnId ??
    ctx.state.activeTurnIdsByThreadKey[key] ??
    null
  );
}

function historyForThread(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  if (ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId) {
    return ctx.state.history;
  }
  const key = pinnedKey(hostId, threadId);
  return ctx.state.threadPreviews[key]?.history ?? ctx.state.threadSnapshots[key]?.history ?? null;
}

function noActiveTurnToInterruptMessage(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
) {
  const history = historyForThread(ctx, hostId, threadId);
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  const lastTurn = turns[turns.length - 1];
  const key = pinnedKey(hostId, threadId);
  return [
    ctx.t("app.noActiveTurnToInterrupt"),
    [
      `hostId=${hostId}`,
      `threadId=${threadId}`,
      `runtimeStatus=${ctx.state.threadStatuses[key] ?? "unknown"}`,
      `storedActiveTurnId=${ctx.state.activeTurnIdsByThreadKey[key] ?? "none"}`,
      `lastTurnId=${lastTurn?.id ?? "none"}`,
      `lastTurnStatus=${lastTurn?.status?.type ?? lastTurn?.status ?? "none"}`,
    ].join(" · "),
  ].join("\n");
}
