import { updateTurnDiff } from "../diff";
import { mergeItemIntoLatestTurn } from "../items";
import { mergeThreadTurns, syncCompletedTurn } from "../turns";
import { idParam, turnParam } from "./params";
import type { AppServerHistoryReducerRegistry } from "./types";

export const turnLifecycleReducers = {
  "turn/started": (input, params) => {
    const turn = turnParam(params);
    return turn
      ? mergeThreadTurns(input.history, input.currentThread, input.threadId, [turn], "append")
      : input.history;
  },

  "turn/completed": (input, params) => {
    const turn = turnParam(params);
    return turn
      ? syncCompletedTurn(input.history, input.currentThread, input.threadId, turn)
      : input.history;
  },

  "turn/diff/updated": (input, params) =>
    updateTurnDiff(input.history, input.currentThread, input.threadId, params),

  "turn/plan/updated": (input, params) => {
    const turnId = idParam(params.turnId);
    return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
      type: "turnPlan",
      id: `${turnId ?? "unknown"}-plan`,
      turnId,
      explanation: params.explanation ?? null,
      plan: Array.isArray(params.plan) ? params.plan : [],
    });
  },
} satisfies AppServerHistoryReducerRegistry;
