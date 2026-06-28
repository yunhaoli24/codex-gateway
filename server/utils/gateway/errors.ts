import type { H3Event } from 'h3'
import type { HostRecord } from '~~/shared/types'

export class CodexRpcError extends Error {
  constructor(
    readonly rpcMethod: string,
    readonly rpcCode: number,
    message: string,
    readonly rpcData?: unknown,
  ) {
    super(message)
    this.name = 'CodexRpcError'
  }
}

export function logGatewayApiError(scope: string, details: Record<string, unknown>, error: unknown) {
  console.error(`[gateway] ${scope} failed`, {
    ...details,
    error: serializeError(error),
  })
}

export function setGatewayRequestLogContext(event: H3Event, scope: string, details: Record<string, unknown>) {
  event.context.gatewayLog = {
    scope,
    details,
  }
}

export function gatewayRequestLogContext(event: H3Event) {
  const context = event.context.gatewayLog
  if (!context || typeof context !== 'object') {
    return null
  }
  const scope = typeof context.scope === 'string' ? context.scope : null
  const details = context.details && typeof context.details === 'object'
    ? context.details as Record<string, unknown>
    : {}
  return scope ? { scope, details } : null
}

export function hostLogContext(host: HostRecord) {
  return {
    hostId: host.id,
    hostName: host.name,
    sshHost: host.sshHost,
    sshUser: host.username,
    sshPort: host.port,
    authMode: host.authMode,
    hasProxy: Boolean(host.proxyUrl),
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof CodexRpcError) {
    return {
      name: error.name,
      message: error.message,
      rpcMethod: error.rpcMethod,
      rpcCode: error.rpcCode,
      rpcData: error.rpcData,
      stack: error.stack,
    }
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeCause((error as any).cause),
    }
  }
  return {
    message: String(error),
  }
}

function serializeCause(cause: unknown) {
  if (!cause) {
    return undefined
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    }
  }
  return cause
}
