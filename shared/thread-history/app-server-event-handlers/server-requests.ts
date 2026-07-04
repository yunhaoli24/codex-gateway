import { itemTypeForServerRequest, PENDING_SERVER_REQUEST_METHODS } from "../../server-requests";
import { mergeItemIntoLatestTurn } from "../items";
import { resolveServerRequestInHistory } from "../requests";
import { idParam } from "./params";
import type {
  AppServerHistoryReducerRegistry,
  AppServerRequestId,
  ApplyAppServerEventInput,
} from "./types";

export const serverRequestReducers = {
  "serverRequest/resolved": (input, params) => {
    const requestId = idParam(params.requestId);
    return requestId
      ? resolveServerRequestInHistory(input.history, input.currentThread, input.threadId, requestId)
      : input.history;
  },
} satisfies AppServerHistoryReducerRegistry;

export const pendingServerRequestReducers = Object.fromEntries(
  PENDING_SERVER_REQUEST_METHODS.map((method) => [method, upsertPendingServerRequest]),
) satisfies AppServerHistoryReducerRegistry;

function upsertPendingServerRequest(
  input: ApplyAppServerEventInput,
  _params: unknown,
  requestId: AppServerRequestId,
) {
  if (requestId === undefined) {
    return input.history;
  }

  const params = input.payload?.params ?? {};
  return mergeItemIntoLatestTurn(input.history, input.currentThread, input.threadId, {
    type: itemTypeForServerRequest(input.method),
    id: `server-request-${String(requestId)}`,
    turnId: idParam(params.turnId) || `server-request-turn-${String(requestId)}`,
    status: "waitingForClient",
    requestId,
    method: input.method,
    params,
  });
}
