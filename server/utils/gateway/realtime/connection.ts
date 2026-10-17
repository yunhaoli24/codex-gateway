import type { RealtimeClientMessage } from "~~/shared/types";
import { parseRealtimeClientMessage } from "~~/shared/runtime/realtime";
import { publicErrorCode, publicErrorMessage } from "../http/errors";
import { realtimeMessageDispatcher } from "./message-handlers";
import { RealtimeAuthenticationRequiredError } from "./message-dispatcher";
import { hostStore } from "../state/hosts";
import { browserPreviewManager } from "../browser-preview/browser-preview-manager";
import { recordFromUnknown } from "~~/shared/utils/records";
import {
  authenticatedUserId,
  runPeerScoped,
  sendRealtimePeerMessage,
  stateFor,
  type RealtimePeer,
} from "./peer-state";
import { clearOwnedSubscriptions, clearSubscriptions } from "./subscription-map";
import {
  decodeTerminalResizePayload,
  decodeTerminalStreamFrame,
  decodeTerminalTextPayload,
  terminalStreamOpcode,
} from "~~/shared/runtime/terminal-stream";
import { terminalManager } from "../terminal/terminal-manager";
import { gatewayLog } from "../logging";

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
    gatewayLog("error", "gateway", "realtime message failed", {
      ...details,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof RealtimeAuthenticationRequiredError) {
      rejectUnauthenticatedPeer(peer, request);
      return;
    }
    sendRealtimePeerMessage(peer, {
      type: "error",
      message: publicErrorMessage(error),
      requestId: request && "requestId" in request ? request.requestId : undefined,
      request,
      code: realtimeErrorCode(error),
      details,
    });
  }
}

export async function handleRealtimePeerBinaryMessage(peer: RealtimePeer, data: Uint8Array) {
  const frame = decodeTerminalStreamFrame(data);
  if (frame === null) {
    sendRealtimePeerMessage(peer, { type: "error", message: "Invalid realtime binary frame" });
    return;
  }

  try {
    const userId = authenticatedUserId(peer);
    if (frame.opcode === terminalStreamOpcode.input) {
      const input = decodeTerminalTextPayload(frame);
      if (input !== null) terminalManager.input(userId, frame.sessionId, input);
      return;
    }
    if (frame.opcode === terminalStreamOpcode.resize) {
      const resize = decodeTerminalResizePayload(frame);
      if (resize !== null) {
        terminalManager.resize(userId, frame.sessionId, resize.cols, resize.rows);
      }
      return;
    }
    if (frame.opcode === terminalStreamOpcode.output) {
      sendRealtimePeerMessage(peer, {
        type: "error",
        message: "Invalid terminal output direction",
      });
    }
  } catch (error: unknown) {
    sendRealtimePeerMessage(peer, {
      type: "error",
      message: error instanceof Error ? error.message : "Realtime binary message failed",
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
  state.terminalOutputStream?.dispose();
  state.terminalOutputStream = undefined;
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
  return publicErrorCode(error) ?? "realtimeMessageFailed";
}
