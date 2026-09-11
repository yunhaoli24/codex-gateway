import type { RealtimeClientMessage } from "~~/shared/types";
import { parseRealtimeClientMessage } from "~~/shared/runtime/realtime";
import {
  isStaleThreadCursorErrorLike,
  STALE_THREAD_CURSOR_ERROR_CODE,
} from "~~/shared/gateway-errors";
import { realtimeMessageDispatcher } from "./message-handlers";
import { RealtimeAuthenticationRequiredError } from "./message-dispatcher";
import { hostStore } from "../state/hosts";
import { browserPreviewManager } from "../browser-preview/browser-preview-manager";
import { recordFromUnknown } from "~~/shared/utils/records";
import { runPeerScoped, sendRealtimePeerMessage, stateFor, type RealtimePeer } from "./peer-state";
import { clearOwnedSubscriptions, clearSubscriptions } from "./subscription-map";

export function openRealtimePeer(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.authTimer = setTimeout(() => {
    if (!state.authenticated) {
      sendRealtimePeerMessage(peer, {
        type: "error",
        message: "Realtime authentication timed out",
      });
      peer.close(1008, "Authentication required");
    }
  }, 10_000);
}

export async function handleRealtimePeerMessage(peer: RealtimePeer, rawMessage: string) {
  let request: RealtimeClientMessage | undefined;
  try {
    request = parseClientMessage(rawMessage);
    await realtimeMessageDispatcher.dispatch(peer, request);
  } catch (error: unknown) {
    const details = realtimeErrorDetails(peer, request, error);
    console.error("[gateway] realtime message failed", {
      ...details,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof RealtimeAuthenticationRequiredError) {
      rejectUnauthenticatedPeer(peer, request);
      return;
    }
    sendRealtimePeerMessage(peer, {
      type: "error",
      message: error instanceof Error ? error.message : "Realtime message failed",
      requestId: request && "requestId" in request ? request.requestId : undefined,
      request,
      code: realtimeErrorCode(error),
      details,
    });
  }
}

export function cleanupRealtimePeer(peer: RealtimePeer) {
  const state = stateFor(peer);
  if (state.authTimer !== undefined) {
    clearTimeout(state.authTimer);
    state.authTimer = undefined;
  }
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = undefined;
  state.terminalUnsubscribe?.();
  state.terminalUnsubscribe = undefined;
  state.notificationUnsubscribe?.();
  state.notificationUnsubscribe = undefined;
  state.pinnedThreadsUnsubscribe?.();
  state.pinnedThreadsUnsubscribe = undefined;
  state.threadRuntimeStatusUnsubscribe?.();
  state.threadRuntimeStatusUnsubscribe = undefined;
  state.browserPreviewUnsubscribe?.();
  state.browserPreviewUnsubscribe = undefined;
  if (state.browserOwnerId !== undefined) browserPreviewManager.closeOwner(state.browserOwnerId);
  state.sessionRevocationUnsubscribe?.();
  state.sessionRevocationUnsubscribe = undefined;
  clearSubscriptions(state.threadUnsubscribers);
  clearSubscriptions(state.hostMetricsUnsubscribers);
  clearSubscriptions(state.tmuxSessionUnsubscribers);
  state.hostMfaUnsubscribe?.();
  state.hostMfaUnsubscribe = undefined;
  clearOwnedSubscriptions(state.fileWatchUnsubscribers);
}

function rejectUnauthenticatedPeer(peer: RealtimePeer, request: RealtimeClientMessage | undefined) {
  sendRealtimePeerMessage(peer, {
    type: "error",
    message: "Realtime connection is not authenticated",
    request,
  });
  peer.close(1008, "Authentication required");
}

function parseClientMessage(raw: string): RealtimeClientMessage {
  const parsed: unknown = JSON.parse(raw);
  return parseRealtimeClientMessage(parsed);
}

function realtimeErrorDetails(
  peer: RealtimePeer,
  request: RealtimeClientMessage | undefined,
  error: unknown,
) {
  const code = realtimeErrorCode(error);
  const errorRecord = recordFromUnknown(error);
  const cause = recordFromUnknown(errorRecord?.cause);
  return {
    requestType: request?.type ?? null,
    requestId: request && "requestId" in request ? request.requestId : null,
    hostId: request && "hostId" in request ? request.hostId : null,
    hostName: realtimeRequestHostName(peer, request),
    threadId: request && "threadId" in request ? request.threadId : null,
    sessionId: request && "sessionId" in request ? request.sessionId : null,
    serverRequestId: request && "serverRequestId" in request ? request.serverRequestId : null,
    code,
    errorName: typeof errorRecord?.name === "string" ? errorRecord.name : null,
    statusCode: errorRecord?.statusCode ?? cause?.statusCode ?? null,
    statusMessage: errorRecord?.statusMessage ?? cause?.statusMessage ?? null,
    rpcMethod: errorRecord?.rpcMethod ?? null,
    rpcCode: errorRecord?.rpcCode ?? null,
  };
}

function realtimeRequestHostName(peer: RealtimePeer, request: RealtimeClientMessage | undefined) {
  if (request === undefined || !("hostId" in request) || stateFor(peer).authenticated === false) {
    return null;
  }
  return runPeerScoped(peer, () => hostStore.get(request.hostId)?.name ?? null);
}

function realtimeErrorCode(error: unknown) {
  if (isStaleThreadCursorErrorLike(error)) {
    return STALE_THREAD_CURSOR_ERROR_CODE;
  }
  return "realtimeMessageFailed";
}
