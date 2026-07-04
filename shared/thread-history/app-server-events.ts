import {
  appServerHistoryDispatcher,
  type ApplyAppServerEventInput,
} from "./app-server-event-handlers";
import type { AppServerRequestId } from "./app-server-event-handlers/types";

export function applyAppServerEventToHistory(input: ApplyAppServerEventInput) {
  const params = input.payload?.params ?? {};
  const requestId = normalizeRequestId(input.payload?.id);
  return appServerHistoryDispatcher.reduce(input.method, input, params, requestId);
}

function normalizeRequestId(requestId: unknown): AppServerRequestId {
  return typeof requestId === "string" || typeof requestId === "number" ? requestId : undefined;
}
