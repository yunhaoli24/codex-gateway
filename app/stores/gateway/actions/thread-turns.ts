import type { ComposerTurnOptions } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { projectThreadRuntime } from "../thread-runtime/projector";
import {
  mergeStartedTurn,
  mergeTurnItems,
  insertOptimisticNewTurnMessage,
  insertOptimisticSteerMessage,
} from "../thread-turns/optimistic-history";
import { loadOlderTurns } from "../thread-turns/older-turns";
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

type TurnRequestResult =
  | { type: "turn.start.accepted"; turn?: any }
  | { type: "turn.steer.accepted"; turnId?: string };

export function createThreadTurnActions(ctx: GatewayStoreContext) {
  return {
    async sendTurn(text: string, options: ComposerTurnOptions = {}) {
      const hostId = ctx.state.selectedHostId;
      const threadId = ctx.state.selectedThreadId;
      if (!hostId || !threadId) {
        return;
      }
      const runtime = projectThreadRuntime(ctx, hostId, threadId);
      const steerTurnId = runtime.canSteer ? runtime.activeTurnId : null;
      const shouldSteerActiveTurn = Boolean(steerTurnId);
      const clientUserMessageId = createClientUserMessageId(
        shouldSteerActiveTurn ? "steer" : "turn",
      );
      if (!shouldSteerActiveTurn) {
        ctx.setThreadRunning(hostId, threadId, true);
      }
      const optimisticContent = optimisticUserContent(text, options);
      if (steerTurnId) {
        insertOptimisticSteerMessage(
          ctx,
          threadId,
          steerTurnId,
          clientUserMessageId,
          optimisticContent,
        );
      } else {
        insertOptimisticNewTurnMessage(ctx, threadId, clientUserMessageId, optimisticContent);
      }
      const projectId = ctx.state.selectedProjectId;
      const cwd = ctx.selectedProject?.remotePath ?? null;
      const requestKind = shouldSteerActiveTurn ? "steer" : "start";
      const executeTurnRequest = steerTurnId
        ? (() => {
            const activeSteerTurnId = steerTurnId;
            return () =>
              steerActiveTurn(ctx, text, clientUserMessageId, activeSteerTurnId, options);
          })()
        : () => startNewTurn(ctx, text, clientUserMessageId, options);
      ctx.state.loading = true;
      ctx.clearError();
      try {
        const result = await runTurnRequestWithAutoRetry<TurnRequestResult>(
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
          executeTurnRequest,
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
        if (result?.type === "turn.start.accepted" && result.turn) {
          const startedTurnId = result.turn?.id ? String(result.turn.id) : "";
          if (startedTurnId && !startedTurnId.startsWith("client-")) {
            ctx.setThreadStatus(hostId, threadId, "running", { turnId: startedTurnId });
          }
          mergeStartedTurn(ctx, threadId, result.turn);
        }
        if (result?.type === "turn.start.accepted" && result.turn?.items?.length) {
          mergeTurnItems(ctx, threadId, result.turn);
        }
        if (result?.type === "turn.steer.accepted" && result.turnId) {
          insertOptimisticSteerMessage(
            ctx,
            threadId,
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
  return projectThreadRuntime(ctx, hostId, threadId).activeTurnId;
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
