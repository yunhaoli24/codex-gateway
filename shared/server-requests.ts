import type { RpcEnvelope } from "./types";

export const CURRENT_TIME_READ_METHOD = "currentTime/read";

export const SERVER_REQUEST_ITEM_TYPES = {
  "item/tool/requestUserInput": "requestUserInput",
  "mcpServer/elicitation/request": "mcpElicitationRequest",
  "item/permissions/requestApproval": "permissionsRequest",
  "item/tool/call": "dynamicToolClientRequest",
  "account/chatgptAuthTokens/refresh": "chatgptAuthTokensRefreshRequest",
  "attestation/generate": "attestationRequest",
} as const;

export type RoutedServerRequestMethod = keyof typeof SERVER_REQUEST_ITEM_TYPES;

export const PENDING_SERVER_REQUEST_METHODS = [
  ...Object.keys(SERVER_REQUEST_ITEM_TYPES),
  CURRENT_TIME_READ_METHOD,
] as const;

const THREAD_REQUEST_METHODS = new Set<string>([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  ...PENDING_SERVER_REQUEST_METHODS,
]);

export function isThreadServerRequestMethod(method: string) {
  return THREAD_REQUEST_METHODS.has(method);
}

export function itemTypeForServerRequest(method: string) {
  return SERVER_REQUEST_ITEM_TYPES[method as RoutedServerRequestMethod] ?? "serverRequest";
}

export function isCurrentTimeReadRequest(message: RpcEnvelope) {
  return message.method === CURRENT_TIME_READ_METHOD && message.id !== undefined;
}

export function buildCurrentTimeReadResponse() {
  return {
    currentTimeAt: Math.floor(Date.now() / 1000),
  };
}
