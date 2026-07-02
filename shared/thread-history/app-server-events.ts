import { itemTypeForServerRequest, isThreadServerRequestMethod } from "../server-requests";
import {
  appendAgentDelta,
  appendItemOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "./deltas";
import { updateTurnDiff } from "./diff";
import { mergeItemIntoLatestTurn } from "./items";
import { resolveServerRequestInHistory } from "./requests";
import { mergeThreadTurns, syncCompletedTurn } from "./turns";

interface ApplyAppServerEventInput {
  history: unknown;
  currentThread: unknown;
  threadId: string;
  method: string;
  payload: any;
  createdAt?: string | null;
}

let fileChangeSequence = 0;

export function applyAppServerEventToHistory(input: ApplyAppServerEventInput) {
  const params = input.payload?.params ?? {};
  const requestId = input.payload?.id;

  switch (input.method) {
    case "turn/started":
      return params.turn
        ? mergeThreadTurns(
            input.history,
            input.currentThread,
            input.threadId,
            [params.turn],
            "append",
          )
        : input.history;
    case "turn/completed":
      return params.turn
        ? syncCompletedTurn(input.history, input.currentThread, input.threadId, params.turn)
        : input.history;
    case "turn/diff/updated":
      return updateTurnDiff(input.history, input.currentThread, input.threadId, params);
    case "turn/plan/updated":
      return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
        type: "turnPlan",
        id: `${params.turnId}-plan`,
        turnId: params.turnId,
        explanation: params.explanation ?? null,
        plan: Array.isArray(params.plan) ? params.plan : [],
      });
    case "item/started":
      return upsertStartedOrCompletedItem(input, params, "started");
    case "item/completed":
      return upsertStartedOrCompletedItem(input, params, "completed");
    case "item/commandExecution/requestApproval":
      return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
        type: "commandExecution",
        id: params.itemId,
        turnId: params.turnId,
        status: "waitingForApproval",
        command: params.command,
        cwd: params.cwd,
        pendingApproval: {
          requestId,
          method: input.method,
          params,
        },
      });
    case "item/fileChange/requestApproval":
      return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
        type: "fileChange",
        id: params.itemId,
        turnId: params.turnId,
        status: "waitingForApproval",
        pendingApproval: {
          requestId,
          method: input.method,
          params,
        },
      });
    case "item/fileChange/patchUpdated":
      return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
        type: "fileChange",
        id: params.itemId,
        turnId: params.turnId,
        changes: tagFileChanges(params.changes),
        status: "inProgress",
      });
    case "item/agentMessage/delta":
      return appendAgentDelta(input.history, input.currentThread, input.threadId, params);
    case "item/plan/delta":
      return appendPlanDelta(input.history, input.currentThread, input.threadId, params);
    case "item/reasoning/summaryTextDelta":
      return appendReasoningSummaryDelta(
        input.history,
        input.currentThread,
        input.threadId,
        params,
      );
    case "item/reasoning/textDelta":
      return appendReasoningTextDelta(input.history, input.currentThread, input.threadId, params);
    case "item/commandExecution/outputDelta":
      return appendItemOutputDelta(
        input.history,
        input.currentThread,
        input.threadId,
        params,
        "commandExecution",
      );
    case "item/fileChange/outputDelta":
      return appendItemOutputDelta(
        input.history,
        input.currentThread,
        input.threadId,
        params,
        "fileChange",
      );
    case "serverRequest/resolved":
      return resolveServerRequestInHistory(
        input.history,
        input.currentThread,
        input.threadId,
        params.requestId,
      );
    default:
      if (requestId !== undefined && isThreadServerRequestMethod(input.method)) {
        return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
          type: itemTypeForServerRequest(input.method),
          id: `server-request-${String(requestId)}`,
          turnId: params.turnId || `server-request-turn-${String(requestId)}`,
          status: "waitingForClient",
          requestId,
          method: input.method,
          params,
        });
      }
      return input.history;
  }
}

function upsertStartedOrCompletedItem(
  input: ApplyAppServerEventInput,
  params: Record<string, any>,
  phase: "started" | "completed",
) {
  if (!params.item) {
    return input.history;
  }
  const eventIso = input.createdAt || new Date().toISOString();
  return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
    ...params.item,
    turnId: params.turnId,
    status: params.item.status ?? (phase === "started" ? "inProgress" : "completed"),
    ...(phase === "started" && !params.item.startedAt ? { startedAt: eventIso } : {}),
    ...(phase === "completed" && !params.item.completedAt ? { completedAt: eventIso } : {}),
  });
}

function tagFileChanges(changes: unknown) {
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes.map((change) =>
    change && typeof change === "object"
      ? { ...(change as Record<string, unknown>), sequence: ++fileChangeSequence }
      : change,
  );
}
