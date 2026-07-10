import type { RealtimeClientMessage } from "~~/shared/types";
import {
  isStaleThreadCursorErrorLike,
  STALE_THREAD_CURSOR_ERROR_CODE,
} from "~~/shared/gateway-errors";
import { realtimeMessageDispatcher } from "./message-handlers";
import { RealtimeAuthenticationRequiredError } from "./message-dispatcher";
import { hostStore } from "../state/hosts";
import { runPeerScoped, sendRealtimePeerMessage, stateFor, type RealtimePeer } from "./peer-state";

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
  } catch (error: any) {
    if (error instanceof RealtimeAuthenticationRequiredError) {
      rejectUnauthenticatedPeer(peer, request);
      return;
    }
    sendRealtimePeerMessage(peer, {
      type: "error",
      message: error?.message || "Realtime message failed",
      requestId: request && "requestId" in request ? request.requestId : undefined,
      request,
      code: realtimeErrorCode(error),
      details: realtimeErrorDetails(peer, request, error),
    });
  }
}

export function cleanupRealtimePeer(peer: RealtimePeer) {
  const state = stateFor(peer);
  if (state.authTimer) {
    clearTimeout(state.authTimer);
    state.authTimer = undefined;
  }
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = undefined;
  state.terminalUnsubscribe?.();
  state.terminalUnsubscribe = undefined;
  state.sessionRevocationUnsubscribe?.();
  state.sessionRevocationUnsubscribe = undefined;
  for (const unsubscribe of state.threadUnsubscribers.values()) {
    unsubscribe();
  }
  state.threadUnsubscribers.clear();
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
  const parsed = JSON.parse(raw) as RealtimeClientMessage;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Invalid realtime message");
  }
  return parsed;
}

function realtimeErrorDetails(
  peer: RealtimePeer,
  request: RealtimeClientMessage | undefined,
  error: any,
) {
  const code = realtimeErrorCode(error);
  return {
    requestType: request?.type ?? null,
    requestId: request && "requestId" in request ? request.requestId : null,
    hostId: request && "hostId" in request ? request.hostId : null,
    hostName: realtimeRequestHostName(peer, request),
    threadId: request && "threadId" in request ? request.threadId : null,
    sessionId: request && "sessionId" in request ? request.sessionId : null,
    serverRequestId: request && "serverRequestId" in request ? request.serverRequestId : null,
    code,
    errorName: error?.name ?? null,
    statusCode: error?.statusCode ?? error?.cause?.statusCode ?? null,
    statusMessage: error?.statusMessage ?? error?.cause?.statusMessage ?? null,
  };
}

function realtimeRequestHostName(peer: RealtimePeer, request: RealtimeClientMessage | undefined) {
  if (!request || !("hostId" in request) || !stateFor(peer).authenticated) {
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
