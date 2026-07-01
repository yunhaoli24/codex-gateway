import type { GatewayEvent, RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { randomUUID } from "node:crypto";
import { userStore } from "../auth/users";
import { requireRecord } from "../http/validation";
import { threadBroker } from "../runtime/broker";
import { gatewayEventStore } from "../state/gateway-events";
import { hostLifecycleBus } from "../state/host-events";
import { hostStore } from "../state/hosts";
import { bindGatewayUser, runWithGatewayUser } from "../state/memory";
import { threadRuntimeEvents } from "../runtime/thread-runtime-events";
import { interruptTurnFromRealtime } from "./turn-interrupt";
import { steerTurnFromRealtime } from "./turn-steer";

export interface RealtimePeer {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  context: Record<string, any>;
}

interface RealtimePeerState {
  authenticated: boolean;
  userId: number | null;
  authTimer?: ReturnType<typeof setTimeout>;
  hostLifecycleUnsubscribe?: () => void;
  threadUnsubscribers: Map<string, () => void>;
}

type RealtimeMessageHandler<T extends RealtimeClientMessage["type"]> = (
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: T }>,
) => void | Promise<void>;

type RealtimeMessageHandlerRegistry = {
  [K in RealtimeClientMessage["type"]]?: RealtimeMessageHandler<K>;
};

const publicHandlers = {
  "auth.authenticate": authenticatePeer,
} satisfies RealtimeMessageHandlerRegistry;

const authenticatedHandlers = {
  "host.lifecycle.subscribe": subscribeHostLifecycle,
  "host.lifecycle.unsubscribe": unsubscribeHostLifecycle,
  "thread.subscribe": subscribeThread,
  "thread.unsubscribe": unsubscribeThread,
  "turn.steer": steerTurn,
  "turn.interrupt": interruptTurn,
  ping: ping,
} satisfies RealtimeMessageHandlerRegistry;

export function openRealtimePeer(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.authTimer = setTimeout(() => {
    if (!state.authenticated) {
      send(peer, { type: "error", message: "Realtime authentication timed out" });
      peer.close(1008, "Authentication required");
    }
  }, 10_000);
}

export async function handleRealtimePeerMessage(peer: RealtimePeer, rawMessage: string) {
  let request: RealtimeClientMessage | undefined;
  try {
    request = parseClientMessage(rawMessage);
    const handler = handlerFor(peer, request);
    await handler(peer, request as never);
  } catch (error: any) {
    send(peer, {
      type: "error",
      message: error?.message || "Realtime message failed",
      requestId: request && "requestId" in request ? request.requestId : undefined,
      request,
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
  send(peer, {
    type: "error",
    message: "Realtime connection is not authenticated",
    request,
  });
  peer.close(1008, "Authentication required");
}

function threadTopicKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

function send(peer: RealtimePeer, message: RealtimeServerMessage) {
  peer.send(JSON.stringify(message));
}

function parseClientMessage(raw: string): RealtimeClientMessage {
  const parsed = JSON.parse(raw) as RealtimeClientMessage;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Invalid realtime message");
  }
  return parsed;
}

function stateFor(peer: RealtimePeer) {
  let state = peer.context.realtime as RealtimePeerState | undefined;
  if (!state) {
    state = { authenticated: false, userId: null, threadUnsubscribers: new Map() };
    peer.context.realtime = state;
  }
  return state;
}

function runPeerScoped<T>(peer: RealtimePeer, callback: () => T): T {
  const userId = stateFor(peer).userId;
  if (!userId) {
    throw new Error("Realtime connection is not authenticated");
  }
  return runWithGatewayUser(userId, callback);
}

function authenticatePeer(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "auth.authenticate" }>,
) {
  const current = stateFor(peer);
  if (current.authenticated) {
    throw new Error("Realtime connection is already authenticated");
  }
  const user = userStore.authenticateToken(String(request.token || ""));
  if (!user) {
    throw new Error("Missing or invalid bearer token");
  }
  if (current.authTimer) {
    clearTimeout(current.authTimer);
  }
  peer.context.realtime = {
    authenticated: true,
    userId: user.id,
    threadUnsubscribers: new Map(),
  } satisfies RealtimePeerState;
  send(peer, { type: "ready", connectionId: randomUUID() });
}

async function subscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.subscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId = String(message.threadId || "");
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    throw new Error("Invalid thread subscription");
  }

  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();

  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  const afterId = Number(message.afterId || 0);
  const sentEventIds = new Set<number>();
  const sendOnce = (event: GatewayEvent) => {
    if (event.id <= afterId || sentEventIds.has(event.id)) {
      return;
    }
    sentEventIds.add(event.id);
    send(peer, { type: "thread.event", event });
  };

  let replaying = true;
  const liveQueue: GatewayEvent[] = [];
  const unsubscribe = threadRuntimeEvents.subscribe(
    hostId,
    threadId,
    bindGatewayUser((event) => {
      if (replaying) {
        liveQueue.push(event);
        return;
      }
      sendOnce(event);
    }),
  );
  state.threadUnsubscribers.set(key, unsubscribe);

  void runPeerScoped(peer, () =>
    threadBroker.ensureUpstreamSubscribed(host, threadId).catch((error: any) => {
      threadRuntimeEvents.record(hostId, threadId, "gateway/error", {
        method: "gateway/error",
        params: {
          message: error?.message || "Failed to subscribe thread upstream",
        },
      });
    }),
  );

  for (const event of gatewayEventStore.list(hostId, threadId, afterId, 200)) {
    sendOnce(event);
  }
  replaying = false;
  for (const event of liveQueue) {
    sendOnce(event);
  }
  liveQueue.length = 0;
}

function unsubscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.unsubscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId = String(message.threadId || "");
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    return;
  }
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  state.threadUnsubscribers.delete(key);
}

function subscribeHostLifecycle(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = hostLifecycleBus.subscribe((event) => {
    send(peer, { type: "host.lifecycle", event });
  });
}

function unsubscribeHostLifecycle(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = undefined;
}

async function steerTurn(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "turn.steer" }>,
) {
  const result = await steerTurnFromRealtime(request);
  send(peer, {
    type: "turn.steer.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    turnId: result?.turnId,
  });
}

async function interruptTurn(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "turn.interrupt" }>,
) {
  await interruptTurnFromRealtime(request);
  send(peer, {
    type: "turn.interrupt.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
  });
}

function ping(peer: RealtimePeer, request: Extract<RealtimeClientMessage, { type: "ping" }>) {
  send(peer, { type: "pong", nonce: request.nonce });
}
