import { defineEventHandler, getRequestURL, setResponseStatus, type H3Event } from "h3";
import type { GatewayConfig, HostRecord } from "~~/shared/types";
import { normalizeNotificationSettings } from "~~/shared/config";
import {
  isStaleThreadCursorErrorLike,
  STALE_THREAD_CURSOR_ERROR_CODE,
  isAppServerShuttingDownError,
  APP_SERVER_SHUTTING_DOWN_ERROR_CODE,
} from "~~/shared/gateway-errors";
import { userStore } from "../auth/users";
import { hostRuntimeSupervisor } from "../runtime/host-runtime-supervisor";
import {
  buildGatewayMemoryState,
  currentGatewayMemoryState,
  replaceCurrentGatewayMemoryState,
  runWithGatewayUser,
} from "../state/memory";
import { recordFromUnknown } from "~~/shared/utils/records";
import { firstNonEmptyString } from "~~/shared/utils/strings";
import { gatewayLog } from "../logging";

export class CodexRpcError extends Error {
  constructor(
    readonly rpcMethod: string,
    readonly rpcCode: number,
    message: string,
    readonly rpcData?: unknown,
  ) {
    super(message);
    this.name = "CodexRpcError";
  }
}

export function logGatewayApiError(
  scope: string,
  details: Record<string, unknown>,
  error: unknown,
) {
  gatewayLog("error", "gateway", `${scope} failed`, {
    ...details,
    error: serializeError(error),
  });
}

export function defineGatewayEventHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return defineEventHandler(async (event) => {
    try {
      const user = event.context.auth?.user;
      if (!user) {
        return await handler(event);
      }
      return await runWithGatewayUser(user.id, async () => {
        ensureUserConfigLoaded(user.id);
        return await handler(event);
      });
    } catch (error) {
      const url = getRequestURL(event);
      const context = gatewayRequestLogContext(event);
      logGatewayApiError(
        context?.scope ?? "request",
        {
          method: event.method,
          path: url.pathname,
          query: url.search.length > 0 ? url.search : null,
          ...context?.details,
        },
        error,
      );
      const statusCode = statusCodeFromError(error);
      setResponseStatus(event, statusCode);
      return {
        error: true,
        statusCode,
        code: publicErrorCode(error),
        message: publicErrorMessage(error),
        details: publicErrorDetails(event, context?.scope ?? "request", context?.details ?? {}),
      };
    }
  });
}

export function ensureUserConfigLoaded(userId: number) {
  const state = currentGatewayMemoryState();
  if (state.configLoaded) {
    return;
  }
  const nextState = buildGatewayMemoryState(userStore.loadConfig(userId));
  nextState.configLoaded = true;
  replaceCurrentGatewayMemoryState(nextState);
  hostRuntimeSupervisor.syncCurrentUserConfig();
}

export function saveCurrentUserConfig(event: H3Event) {
  const user = event.context.auth?.user;
  if (!user) {
    return null;
  }
  userStore.saveConfig(user.id, runtimeConfigFromMemory());
}

export function runtimeConfigFromMemory(): GatewayConfig {
  const state = currentGatewayMemoryState();
  return {
    version: 2,
    hosts: state.hosts.map((host) => ({
      ...host,
      hasPassword: Boolean(host.password),
    })),
    pinnedThreads: state.pinnedThreads,
    notifications: normalizeNotificationSettings(state.notifications),
  };
}

export function setGatewayRequestLogContext(
  event: H3Event,
  scope: string,
  details: Record<string, unknown>,
) {
  event.context.gatewayLog = {
    scope,
    details,
  };
}

export function gatewayRequestLogContext(event: H3Event) {
  const record = recordFromUnknown(event.context.gatewayLog);
  const scope = typeof record?.scope === "string" ? record.scope : null;
  const details = recordFromUnknown(record?.details) ?? {};
  return scope === null ? null : { scope, details };
}

export function hostLogContext(host: HostRecord) {
  return {
    hostId: host.id,
    hostName: host.name,
    sshHost: host.sshHost,
    sshUser: host.username,
    sshPort: host.port,
    authMode: host.authMode,
    hasPassword: host.authMode === "password" ? Boolean(host.password) : undefined,
    hasPrivateKey: host.authMode === "privateKey" ? Boolean(host.privateKey) : undefined,
    privateKeyPath: host.authMode === "privateKey" ? host.privateKeyPath : undefined,
    hasProxy: Boolean(host.proxyUrl),
  };
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
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeCause(error.cause),
    };
  }
  return {
    message: String(error),
  };
}

function statusCodeFromError(error: unknown) {
  if (isAppServerShuttingDownError(error)) return 503;
  if (isStaleThreadCursorErrorLike(error)) {
    return 409;
  }
  const statusCodeValue = recordFromUnknown(error)?.statusCode;
  const statusCode = typeof statusCodeValue === "number" ? statusCodeValue : null;
  if (statusCode !== null && statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }
  return 502;
}

export function publicErrorCode(error: unknown) {
  if (isAppServerShuttingDownError(error)) return APP_SERVER_SHUTTING_DOWN_ERROR_CODE;
  const code = recordFromUnknown(error)?.code;
  if (typeof code === "string") {
    return code;
  }
  if (isStaleThreadCursorErrorLike(error)) {
    return STALE_THREAD_CURSOR_ERROR_CODE;
  }
  return undefined;
}

export function publicErrorMessage(error: unknown) {
  if (isAppServerShuttingDownError(error)) {
    return "Codex app-server is shutting down for an update or restart. Wait for it to reconnect before trying again.";
  }
  if (error instanceof CodexRpcError) {
    return firstNonEmptyString([error.message]) ?? `Codex RPC ${error.rpcMethod} failed`;
  }
  if (error instanceof Error) {
    return firstNonEmptyString([error.message, error.name]) ?? "Gateway request failed";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error == null) {
    return "Gateway request failed";
  }
  return JSON.stringify(error);
}

function publicErrorDetails(event: H3Event, scope: string, details: Record<string, unknown>) {
  const url = getRequestURL(event);
  return {
    scope,
    method: event.method,
    path: url.pathname,
    query: url.search.length > 0 ? url.search : null,
    ...details,
  };
}

function serializeCause(cause: unknown) {
  if (cause === null || cause === undefined) {
    return undefined;
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  return cause;
}
