import type { AgentEvent } from "../agent/events";
import type { ThreadHistorySeed, ThreadHistoryState, ThreadPlanStep } from "./types";
import {
  appendAgentDelta,
  appendCommandOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "./deltas";
import { updateTurnDiff } from "./diff";
import { mergeItemIntoLatestTurn } from "./items";
import { resolveServerRequestInHistory } from "./requests";
import { upsertTurnResponseUsage } from "./response-usage";
import { mergeThreadTurns, syncCompletedTurn } from "./turns";
import { recordFromUnknown } from "../utils/records";

/**
 * The materialized snapshot consumes the same canonical event as the browser.
 * Keeping this reducer provider-neutral prevents a second raw-method projection
 * from drifting when another agent protocol is added.
 */
export function applyCanonicalEventToHistory(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  event: AgentEvent,
) {
  switch (event.type) {
    case "turn.started":
      return mergeThreadTurns(history, currentThread, threadId, [event.turn], "append");
    case "turn.completed":
      return syncCompletedTurn(history, currentThread, threadId, event.turn);
    case "turn.diff.updated":
      return updateTurnDiff(history, currentThread, threadId, {
        turnId: event.turnId,
        diff: event.diff,
      });
    case "turn.plan.updated":
      return mergeItemIntoLatestTurn(history, currentThread, threadId, {
        type: "turnPlan",
        id: `${event.turnId}-plan`,
        turnId: event.turnId,
        explanation: event.explanation,
        plan: planSteps(event.plan),
      });
    case "timeline.item.upsert":
      return mergeItemIntoLatestTurn(history, currentThread, threadId, event.item);
    case "timeline.item.delta":
      return applyDelta(history, currentThread, threadId, event);
    case "serverRequest.requested":
      return mergeItemIntoLatestTurn(history, currentThread, threadId, event.item);
    case "serverRequest.resolved":
      return resolveServerRequestInHistory(history, currentThread, threadId, event.requestId);
    case "turn.usage.upsert":
      return upsertTurnResponseUsage(
        history,
        currentThread,
        threadId,
        event.turnId,
        event.responseId,
        event.amount,
      );
    case "error.reported":
    case "gateway.error":
    case "gateway.stderr":
    case "mcp.eventStream.notification":
    case "mcpServer.startupStatus.updated":
    case "notice":
    case "thread.goal.cleared":
    case "thread.goal.updated":
    case "thread.realtime.error":
    case "thread.settings.updated":
    case "thread.started":
    case "thread.status.changed":
    case "thread.usage.updated":
      return history;
  }
}

function planSteps(values: unknown[]): ThreadPlanStep[] {
  return values.flatMap((value) => {
    if (typeof value === "string") return [{ step: value }];
    if (typeof value !== "object" || value === null) return [];
    const record = recordFromUnknown(value);
    if (record === null) return [];
    if (typeof record.step !== "string") return [];
    return [
      { step: record.step, status: typeof record.status === "string" ? record.status : null },
    ];
  });
}

function applyDelta(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  event: Extract<AgentEvent, { type: "timeline.item.delta" }>,
) {
  const params = {
    itemId: event.itemId,
    turnId: event.turnId,
    delta: event.delta,
    summaryIndex: event.summaryIndex,
    contentIndex: event.contentIndex,
  };
  switch (event.channel) {
    case "agentMessage":
      return appendAgentDelta(history, currentThread, threadId, params);
    case "plan":
      return appendPlanDelta(history, currentThread, threadId, params);
    case "reasoningSummary":
      return appendReasoningSummaryDelta(history, currentThread, threadId, params);
    case "reasoningText":
      return appendReasoningTextDelta(history, currentThread, threadId, params);
    case "commandOutput":
      return appendCommandOutputDelta(history, currentThread, threadId, params);
  }
}
