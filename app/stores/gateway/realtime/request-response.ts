import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;
type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

interface PendingRealtimeRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof window.setTimeout>;
}

const pendingRealtimeRequests = new Map<string, PendingRealtimeRequest>();

export async function sendRealtimeRequest<T>(
  ctx: GatewayStoreContext,
  buildMessage: (requestId: string) => RealtimeRequestMessage,
  timeoutMs = 15_000,
) {
  await waitForRealtimeReady(ctx, timeoutMs);
  const requestId = `gateway-ws-${crypto.randomUUID()}`;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingRealtimeRequests.delete(requestId);
      reject(new Error(ctx.t("app.realtimeRequestTimedOut")));
    }, timeoutMs);
    pendingRealtimeRequests.set(requestId, { resolve: resolve as any, reject, timer });
    const sent = ctx.sendRealtime(buildMessage(requestId));
    if (!sent) {
      rejectRealtimeRequest(requestId, new Error(ctx.t("app.realtimeUnavailable")));
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
  for (const requestId of pendingRealtimeRequests.keys()) {
    rejectRealtimeRequest(requestId, error);
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
