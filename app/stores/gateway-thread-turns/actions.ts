import type { ComposerTurnOptions } from "~~/shared/types";
import type { ThreadHistoryTurn } from "~~/shared/thread-history/types";
import type { AppServerTurnDisplayError } from "@/stores/gateway/errors";
import { useGatewayTranslator } from "@/composables/i18n/useGatewayTranslator";
import { interruptActiveTurn, interruptThreadTurn } from "./interrupt";
import { loadOlderTurns } from "./older-turns";
import { loadTurnItems } from "./turn-items";
import { loadItemOutput, type ItemOutputRequest } from "./item-output";
import { maybeQueueServerOverloadedRetry, maybeRetryAfterTurnFailure } from "./retry";
import { sendTurn } from "./submission";
import { respondToServerRequest } from "./transport";

export function createGatewayThreadTurnActions() {
  const t = useGatewayTranslator();
  return {
    sendTurn: (text: string, options?: ComposerTurnOptions) => sendTurn(t, text, options),
    loadOlderTurns: (options?: { limit?: number }) => loadOlderTurns(t, options),
    loadTurnItems: (turnId: string) => loadTurnItems(t, turnId),
    loadItemOutput: (input: ItemOutputRequest) => loadItemOutput(t, input),
    interruptActiveTurn: () => interruptActiveTurn(t),
    interruptThreadTurn: (input: { hostId: number; threadId: string }) =>
      interruptThreadTurn(t, input),
    respondToServerRequest,
    maybeQueueServerOverloadedRetry: (
      hostId: number,
      threadId: string,
      turnId: string,
      error: AppServerTurnDisplayError,
    ) => maybeQueueServerOverloadedRetry(t, hostId, threadId, turnId, error),
    maybeRetryAfterTurnFailure: (hostId: number, threadId: string, turn: ThreadHistoryTurn) =>
      maybeRetryAfterTurnFailure(t, hostId, threadId, turn),
  };
}
