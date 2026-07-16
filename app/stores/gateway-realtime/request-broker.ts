import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { createUuid } from "@/lib/uuid";
import { RealtimeRequestError } from "./request-errors";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;
type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

interface PendingRealtimeRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
  request: RealtimeRequestMessage;
}

interface RealtimeRequestBrokerOptions {
  connect: () => void;
  isConnected: () => boolean;
  send: (message: RealtimeClientMessage) => boolean;
  unavailableMessage: () => string;
  timeoutMessage: () => string;
}

const REALTIME_READY_TIMEOUT_MS = 15_000;
// SSH reconnect and a remote Codex upgrade can precede app-server RPC work.
// Keep the browser deadline beyond the backend's 30-minute operation cap.
const REALTIME_REQUEST_TIMEOUT_MS = 31 * 60_000;

export function createRealtimeRequestBroker(options: RealtimeRequestBrokerOptions) {
  const pendingRequests = new Map<string, PendingRealtimeRequest>();

  async function request<T>(
    buildMessage: (requestId: string) => RealtimeRequestMessage,
    timeoutMs = REALTIME_REQUEST_TIMEOUT_MS,
  ) {
    await waitForReady(REALTIME_READY_TIMEOUT_MS);
    const requestId = `gateway-ws-${createUuid()}`;
    const requestMessage = buildMessage(requestId);

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(
          new RealtimeRequestError(options.timeoutMessage(), requestMessage, "timeout", {
            requestId,
            timeoutMs,
            ...requestHostDetails(requestMessage),
          }),
        );
      }, timeoutMs);

      pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        request: requestMessage,
      });
      if (!options.send(requestMessage)) {
        rejectRequest(
          requestId,
          new RealtimeRequestError(options.unavailableMessage(), requestMessage, "unavailable", {
            requestId,
            ...requestHostDetails(requestMessage),
          }),
        );
      }
    });
  }

  function resolveRequest(message: RealtimeResponseMessage) {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRequests.delete(message.requestId);
    pending.resolve(message);
  }

  function rejectRequest(requestId: string, error: Error) {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.reject(error);
  }

  function rejectAllRequests(error: Error) {
    for (const [requestId, pending] of pendingRequests) {
      rejectRequest(
        requestId,
        new RealtimeRequestError(error.message, pending.request, "disconnected", {
          requestId,
          ...requestHostDetails(pending.request),
        }),
      );
    }
  }

  async function waitForReady(timeoutMs: number) {
    options.connect();
    if (options.isConnected()) return;

    const startedAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      const poll = () => {
        if (options.isConnected()) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(options.unavailableMessage()));
          return;
        }
        window.setTimeout(poll, 25);
      };
      poll();
    });
  }

  function requestHostDetails(request: RealtimeRequestMessage) {
    if (!("hostId" in request)) return {};
    const hostName = useGatewayStore().hosts.find((host) => host.id === request.hostId)?.name;
    return hostName ? { hostName } : {};
  }

  return { request, resolveRequest, rejectRequest, rejectAllRequests };
}
