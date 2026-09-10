import type { RpcEnvelope } from "~~/shared/types";

/** Codex-only server-request details stay inside the Codex provider. */
export const CURRENT_TIME_READ_METHOD = "currentTime/read";

export const SERVER_REQUEST_ITEM_TYPES = {
  "item/tool/requestUserInput": "requestUserInput",
  "mcpServer/elicitation/request": "mcpElicitationRequest",
  "item/permissions/requestApproval": "permissionsRequest",
  "item/tool/call": "dynamicToolClientRequest",
  "account/chatgptAuthTokens/refresh": "chatgptAuthTokensRefreshRequest",
  "attestation/generate": "attestationRequest",
} as const;

export const PENDING_SERVER_REQUEST_METHODS = [
  ...Object.keys(SERVER_REQUEST_ITEM_TYPES),
  CURRENT_TIME_READ_METHOD,
] as const;

export function itemTypeForServerRequest(method: string): string {
  return isRoutedServerRequestMethod(method) ? SERVER_REQUEST_ITEM_TYPES[method] : "serverRequest";
}

export function isCurrentTimeReadRequest(message: RpcEnvelope) {
  return message.method === CURRENT_TIME_READ_METHOD && message.id !== undefined;
}

export function buildCurrentTimeReadResponse() {
  return { currentTimeAt: Math.floor(Date.now() / 1000) };
}

function isRoutedServerRequestMethod(
  method: string,
): method is keyof typeof SERVER_REQUEST_ITEM_TYPES {
  return Object.hasOwn(SERVER_REQUEST_ITEM_TYPES, method);
}
