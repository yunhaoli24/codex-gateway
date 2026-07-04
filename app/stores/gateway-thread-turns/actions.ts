import type { ComposerTurnOptions } from "~~/shared/types";
import type { AppServerTurnDisplayError } from "@/stores/gateway/errors";
import { interruptActiveTurn, interruptThreadTurn } from "./interrupt";
import { loadOlderTurns } from "./older-turns";
import { maybeQueueServerOverloadedRetry, maybeRetryAfterTurnFailure } from "./retry";
import { sendTurn } from "./submission";
import { respondToServerRequest } from "./transport";

export function createGatewayThreadTurnActions() {
  const { t } = useI18n();
  return {
    sendTurn: (text: string, options?: ComposerTurnOptions) => sendTurn(t, text, options),
    loadOlderTurns: (options?: { limit?: number }) => loadOlderTurns(t, options),
    interruptActiveTurn: () => interruptActiveTurn(t),
    interruptThreadTurn: (input: { hostId: number; threadId: string; projectId?: number | null }) =>
      interruptThreadTurn(t, input),
    respondToServerRequest,
    maybeQueueServerOverloadedRetry: (
      hostId: number,
      threadId: string,
      turnId: string,
      error: AppServerTurnDisplayError,
    ) => maybeQueueServerOverloadedRetry(t, hostId, threadId, turnId, error),
    maybeRetryAfterTurnFailure: (hostId: number, threadId: string, turn: Record<string, any>) =>
      maybeRetryAfterTurnFailure(t, hostId, threadId, turn),
  };
}
