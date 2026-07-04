import { mergeItemIntoLatestTurn } from "../items";
import { idParam, itemParam } from "./params";
import type {
  AppServerEventParams,
  AppServerHistoryReducerRegistry,
  ApplyAppServerEventInput,
} from "./types";

let fileChangeSequence = 0;

export const itemLifecycleReducers = {
  "item/started": (input, params) => upsertStartedOrCompletedItem(input, params, "started"),

  "item/completed": (input, params) => upsertStartedOrCompletedItem(input, params, "completed"),

  "item/commandExecution/requestApproval": (input, params, requestId) =>
    mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
      type: "commandExecution",
      id: idParam(params.itemId),
      turnId: idParam(params.turnId),
      status: "waitingForApproval",
      command: params.command,
      cwd: params.cwd,
      pendingApproval: {
        requestId,
        method: input.method,
        params,
      },
    }),

  "item/fileChange/requestApproval": (input, params, requestId) =>
    mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
      type: "fileChange",
      id: idParam(params.itemId),
      turnId: idParam(params.turnId),
      status: "waitingForApproval",
      pendingApproval: {
        requestId,
        method: input.method,
        params,
      },
    }),

  "item/fileChange/patchUpdated": (input, params) =>
    mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
      type: "fileChange",
      id: idParam(params.itemId),
      turnId: idParam(params.turnId),
      changes: tagFileChanges(params.changes),
      status: "inProgress",
    }),
} satisfies AppServerHistoryReducerRegistry;

function upsertStartedOrCompletedItem(
  input: ApplyAppServerEventInput,
  params: AppServerEventParams,
  phase: "started" | "completed",
) {
  const item = itemParam(params);
  if (!item) {
    return input.history;
  }
  const eventIso = input.createdAt || new Date().toISOString();
  return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
    ...item,
    turnId: idParam(params.turnId),
    status: item.status ?? (phase === "started" ? "inProgress" : "completed"),
    ...(phase === "started" && !item.startedAt ? { startedAt: eventIso } : {}),
    ...(phase === "completed" && !item.completedAt ? { completedAt: eventIso } : {}),
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
