import { defineEventHandler, getRequestURL, setResponseStatus, type H3Event } from "h3";
import type { HostRecord } from "~~/shared/types";
import { userStore } from "../auth/users";
import {
  buildGatewayMemoryState,
  currentGatewayMemoryState,
  replaceCurrentGatewayMemoryState,
  runWithGatewayUser,
} from "../state/memory";

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
  console.error(`[gateway] ${scope} failed`, {
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
          query: url.search || null,
          ...context?.details,
        },
        error,
      );
      const statusCode = statusCodeFromError(error);
      setResponseStatus(event, statusCode);
      return {
        error: true,
        statusCode,
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
}

export function saveCurrentUserConfig(event: H3Event) {
  const user = event.context.auth?.user;
  if (!user) {
    return;
  }
  userStore.saveConfig(user.id, runtimeConfigFromMemory());
}

export function runtimeConfigFromMemory() {
  const state = currentGatewayMemoryState();
  return {
    version: 1,
    hosts: state.hosts.map((host) => ({
      ...host,
      hasPassword: Boolean(host.password),
    })),
    projects: state.projects,
    pinnedThreads: state.pinnedThreads,
    lastOpenThread: state.lastOpenThread ?? null,
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
  const context = event.context.gatewayLog;
  if (!context || typeof context !== "object") {
    return null;
  }
  const scope = typeof context.scope === "string" ? context.scope : null;
  const details =
    context.details && typeof context.details === "object"
      ? (context.details as Record<string, unknown>)
      : {};
  return scope ? { scope, details } : null;
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
      cause: serializeCause((error as any).cause),
    };
  }
  return {
    message: String(error),
  };
}

function statusCodeFromError(error: unknown) {
  const statusCode =
    typeof (error as any)?.statusCode === "number" ? Number((error as any).statusCode) : null;
  if (statusCode && statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }
  return 502;
}

function publicErrorMessage(error: unknown) {
  if (error instanceof CodexRpcError) {
    return error.message || `Codex RPC ${error.rpcMethod} failed`;
  }
  if (error instanceof Error) {
    return error.message || error.name || "Gateway request failed";
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
    query: url.search || null,
    ...details,
  };
}

function serializeCause(cause: unknown) {
  if (!cause) {
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
