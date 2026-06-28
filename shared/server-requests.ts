import type { RpcEnvelope } from './types'

export const SERVER_REQUEST_ITEM_TYPES = {
  'item/tool/requestUserInput': 'requestUserInput',
  'mcpServer/elicitation/request': 'mcpElicitationRequest',
  'item/permissions/requestApproval': 'permissionsRequest',
  'item/tool/call': 'dynamicToolClientRequest',
  'account/chatgptAuthTokens/refresh': 'chatgptAuthTokensRefreshRequest',
  'attestation/generate': 'attestationRequest',
} as const

export type RoutedServerRequestMethod = keyof typeof SERVER_REQUEST_ITEM_TYPES

const THREAD_REQUEST_METHODS = new Set<string>([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  ...Object.keys(SERVER_REQUEST_ITEM_TYPES),
  'currentTime/read',
])

export function isThreadServerRequestMethod(method: string) {
  return THREAD_REQUEST_METHODS.has(method)
}

export function itemTypeForServerRequest(method: string) {
  return SERVER_REQUEST_ITEM_TYPES[method as RoutedServerRequestMethod] ?? 'serverRequest'
}

export function isCurrentTimeReadRequest(message: RpcEnvelope) {
  return message.method === 'currentTime/read' && message.id !== undefined
}

export function buildCurrentTimeReadResponse() {
  return {
    currentTimeAt: Math.floor(Date.now() / 1000),
  }
}
