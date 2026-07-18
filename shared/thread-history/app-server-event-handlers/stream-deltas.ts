import {
  appendAgentDelta,
  appendCommandOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "../deltas";
import type { AppServerHistoryReducerRegistry } from "./types";

export const streamDeltaReducers = {
  "item/agentMessage/delta": (input, params) =>
    appendAgentDelta(input.history, input.currentThread, input.threadId, params),

  "item/plan/delta": (input, params) =>
    appendPlanDelta(input.history, input.currentThread, input.threadId, params),

  "item/reasoning/summaryTextDelta": (input, params) =>
    appendReasoningSummaryDelta(input.history, input.currentThread, input.threadId, params),

  "item/reasoning/textDelta": (input, params) =>
    appendReasoningTextDelta(input.history, input.currentThread, input.threadId, params),

  "item/commandExecution/outputDelta": (input, params) =>
    appendCommandOutputDelta(input.history, input.currentThread, input.threadId, params),
} satisfies AppServerHistoryReducerRegistry;
