import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;
type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

interface PendingRealtimeRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: number;
  request: RealtimeRequestMessage;
}

const pendingRealtimeRequests = new Map<string, PendingRealtimeRequest>();

export class RealtimeRequestError extends Error {
  constructor(
    message: string,
    readonly request: RealtimeRequestMessage | undefined,
    readonly reason: "timeout" | "unavailable" | "disconnected" | "server",
    readonly details: Record<string, unknown> = {},
  ) {
    super(formatRealtimeRequestError(message, request, details));
    this.name = "RealtimeRequestError";
  }
}

export async function sendRealtimeRequest<T>(
  ctx: GatewayStoreContext,
  buildMessage: (requestId: string) => RealtimeRequestMessage,
  timeoutMs = 15_000,
) {
  await waitForRealtimeReady(ctx, timeoutMs);
  const requestId = `gateway-ws-${crypto.randomUUID()}`;
  const request = buildMessage(requestId);
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingRealtimeRequests.delete(requestId);
      reject(
        new RealtimeRequestError(ctx.t("app.realtimeRequestTimedOut"), request, "timeout", {
          requestId,
          timeoutMs,
        }),
      );
    }, timeoutMs);
    pendingRealtimeRequests.set(requestId, { resolve: resolve as any, reject, timer, request });
    const sent = ctx.sendRealtime(request);
    if (!sent) {
      rejectRealtimeRequest(
        requestId,
        new RealtimeRequestError(ctx.t("app.realtimeUnavailable"), request, "unavailable", {
          requestId,
        }),
      );
    }
  });
}

export function resolveRealtimeRequest(message: RealtimeResponseMessage) {
  const pending = pendingRealtimeRequests.get(message.requestId);
  if (!pending) {
    return;
  }
  window.clearTimeout(pending.timer);
  pendingRealtimeRequests.delete(message.requestId);
  pending.resolve(message);
}

export function rejectRealtimeRequest(requestId: string, error: Error) {
  const pending = pendingRealtimeRequests.get(requestId);
  if (!pending) {
    return;
  }
  window.clearTimeout(pending.timer);
  pendingRealtimeRequests.delete(requestId);
  pending.reject(error);
}

export function rejectAllRealtimeRequests(error: Error) {
  for (const [requestId, pending] of pendingRealtimeRequests) {
    rejectRealtimeRequest(
      requestId,
      new RealtimeRequestError(error.message, pending.request, "disconnected", { requestId }),
    );
  }
}

async function waitForRealtimeReady(ctx: GatewayStoreContext, timeoutMs: number) {
  ctx.connectRealtime();
  if (ctx.state.realtimeSocketConnected) {
    return;
  }
  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const poll = () => {
      if (ctx.state.realtimeSocketConnected) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(ctx.t("app.realtimeUnavailable")));
        return;
      }
      window.setTimeout(poll, 25);
    };
    poll();
  });
}

export function realtimeRequestErrorFromServer(
  message: string,
  request: RealtimeRequestMessage | undefined,
  details: Record<string, unknown> = {},
) {
  return new RealtimeRequestError(message, request, "server", details);
}

function formatRealtimeRequestError(
  message: string,
  request: RealtimeRequestMessage | undefined,
  details: Record<string, unknown>,
) {
  const lines = [message];
  const context = [
    request?.type ? `type=${request.type}` : null,
    request && "hostId" in request ? `hostId=${request.hostId}` : null,
    request && "threadId" in request ? `threadId=${request.threadId}` : null,
    request && "requestId" in request ? `requestId=${request.requestId}` : null,
    typeof details.timeoutMs === "number" ? `timeoutMs=${details.timeoutMs}` : null,
    typeof details.serverRequestId === "string" || typeof details.serverRequestId === "number"
      ? `serverRequestId=${details.serverRequestId}`
      : null,
  ].filter(Boolean);
  if (context.length) {
    lines.push(context.join(" · "));
  }
  return lines.join("\n");
}
