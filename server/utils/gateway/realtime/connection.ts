import type { RealtimeClientMessage } from "~~/shared/types";
import { authenticatePeer } from "./handlers/auth";
import { subscribeHostLifecycle, unsubscribeHostLifecycle } from "./handlers/host-lifecycle";
import { activateThread, subscribeThread, unsubscribeThread } from "./handlers/thread-events";
import { clearThreadGoal, getThreadGoal, setThreadGoal } from "./handlers/thread-goals";
import {
  closeTerminal,
  listTerminals,
  openTerminal,
  resizeTerminal,
  subscribeTerminalEvents,
  writeTerminalInput,
} from "./handlers/terminal";
import {
  interruptTurn,
  ping,
  respondToServerRequest,
  startTurn,
  steerTurn,
} from "./handlers/turns";
import { runPeerScoped, sendRealtimePeerMessage, stateFor, type RealtimePeer } from "./peer-state";

type RealtimeMessageHandler<T extends RealtimeClientMessage["type"]> = (
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: T }>,
) => void | Promise<void>;

type RealtimeMessageHandlerRegistry = {
  [K in RealtimeClientMessage["type"]]?: RealtimeMessageHandler<K>;
};

const publicHandlers: RealtimeMessageHandlerRegistry = {
  "auth.authenticate": authenticatePeer,
};

const authenticatedHandlers: RealtimeMessageHandlerRegistry = {
  "host.lifecycle.subscribe": subscribeHostLifecycle,
  "host.lifecycle.unsubscribe": unsubscribeHostLifecycle,
  "thread.activate": activateThread,
  "thread.subscribe": subscribeThread,
  "thread.unsubscribe": unsubscribeThread,
  "thread.goal.set": setThreadGoal,
  "thread.goal.get": getThreadGoal,
  "thread.goal.clear": clearThreadGoal,
  "turn.start": startTurn,
  "turn.steer": steerTurn,
  "turn.interrupt": interruptTurn,
  "serverRequest.respond": respondToServerRequest,
  "terminal.open": openTerminal,
  "terminal.list": listTerminals,
  "terminal.input": writeTerminalInput,
  "terminal.resize": resizeTerminal,
  "terminal.close": closeTerminal,
  ping,
};

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
    const wasAuthenticated = stateFor(peer).authenticated;
    const handler = handlerFor(peer, request);
    await handler(peer, request as never);
    if (!wasAuthenticated && request.type === "auth.authenticate") {
      subscribeTerminalEvents(peer);
    }
  } catch (error: any) {
    sendRealtimePeerMessage(peer, {
      type: "error",
      message: error?.message || "Realtime message failed",
      requestId: request && "requestId" in request ? request.requestId : undefined,
      request,
      code: "realtimeMessageFailed",
      details: realtimeErrorDetails(request, error),
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
  for (const unsubscribe of state.threadUnsubscribers.values()) {
    unsubscribe();
  }
  state.threadUnsubscribers.clear();
}

function handlerFor(peer: RealtimePeer, request: RealtimeClientMessage) {
  const state = stateFor(peer);
  if (state.authenticated) {
    const handler = authenticatedHandlers[request.type] ?? publicHandlers[request.type];
    if (handler) {
      return scopedHandler(peer, handler);
    }
    throw new Error(`Unsupported realtime message: ${request.type}`);
  }
  const publicHandler = publicHandlers[request.type];
  if (publicHandler) {
    return publicHandler;
  }
  return unauthenticatedHandler;
}

function scopedHandler(peer: RealtimePeer, handler: RealtimeMessageHandler<any>) {
  return (scopedPeer: RealtimePeer, request: any) =>
    runPeerScoped(peer, () => handler(scopedPeer, request));
}

function unauthenticatedHandler(peer: RealtimePeer, request: RealtimeClientMessage) {
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

function realtimeErrorDetails(request: RealtimeClientMessage | undefined, error: any) {
  return {
    requestType: request?.type ?? null,
    requestId: request && "requestId" in request ? request.requestId : null,
    hostId: request && "hostId" in request ? request.hostId : null,
    threadId: request && "threadId" in request ? request.threadId : null,
    sessionId: request && "sessionId" in request ? request.sessionId : null,
    serverRequestId: request && "serverRequestId" in request ? request.serverRequestId : null,
    errorName: error?.name ?? null,
    statusCode: error?.statusCode ?? error?.cause?.statusCode ?? null,
    statusMessage: error?.statusMessage ?? error?.cause?.statusMessage ?? null,
  };
}
