import type { GatewayEvent, RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { randomUUID } from "node:crypto";
import { threadBroker } from "../utils/gateway/runtime/broker";
import { userStore } from "../utils/gateway/auth/users";
import { requireRecord } from "../utils/gateway/http/validation";
import { gatewayEventStore } from "../utils/gateway/state/gateway-events";
import { hostLifecycleBus } from "../utils/gateway/state/host-events";
import { hostStore } from "../utils/gateway/state/hosts";
import { bindGatewayUser, runWithGatewayUser } from "../utils/gateway/state/memory";

type Peer = Parameters<NonNullable<Parameters<typeof defineWebSocketHandler>[0]["open"]>>[0];

interface RealtimePeerState {
  authenticated: boolean;
  userId: number | null;
  authTimer?: ReturnType<typeof setTimeout>;
  hostLifecycleUnsubscribe?: () => void;
  threadUnsubscribers: Map<string, () => void>;
}

function threadTopicKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

function send(peer: Peer, message: RealtimeServerMessage) {
  peer.send(JSON.stringify(message));
}

function parseClientMessage(raw: string): RealtimeClientMessage {
  const parsed = JSON.parse(raw) as RealtimeClientMessage;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Invalid realtime message");
  }
  return parsed;
}

function stateFor(peer: Peer) {
  let state = peer.context.realtime as RealtimePeerState | undefined;
  if (!state) {
    state = { authenticated: false, userId: null, threadUnsubscribers: new Map() };
    peer.context.realtime = state;
  }
  return state;
}

function runPeerScoped<T>(peer: Peer, callback: () => T): T {
  const userId = stateFor(peer).userId;
  if (!userId) {
    throw new Error("Realtime connection is not authenticated");
  }
  return runWithGatewayUser(userId, callback);
}

function authenticatePeer(
  peer: Peer,
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
  peer: Peer,
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
  const unsubscribe = await threadBroker.subscribe(
    host,
    threadId,
    bindGatewayUser((event) => {
      if (replaying) {
        liveQueue.push(event);
        return;
      }
      sendOnce(event);
    }),
    bindGatewayUser(() => {
      send(peer, { type: "thread.closed", hostId, threadId });
    }),
  );
  state.threadUnsubscribers.set(key, unsubscribe);

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
  peer: Peer,
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

function subscribeHostLifecycle(peer: Peer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = hostLifecycleBus.subscribe((event) => {
    send(peer, { type: "host.lifecycle", event });
  });
}

function unsubscribeHostLifecycle(peer: Peer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = undefined;
}

function cleanup(peer: Peer) {
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

export default defineWebSocketHandler({
  open(peer) {
    const state = stateFor(peer);
    state.authTimer = setTimeout(() => {
      if (!state.authenticated) {
        send(peer, { type: "error", message: "Realtime authentication timed out" });
        peer.close(1008, "Authentication required");
      }
    }, 10_000);
  },

  async message(peer, message) {
    let request: RealtimeClientMessage | undefined;
    try {
      request = parseClientMessage(message.text());
      if (request.type === "auth.authenticate") {
        authenticatePeer(peer, request);
        return;
      }
      if (!stateFor(peer).authenticated) {
        send(peer, {
          type: "error",
          message: "Realtime connection is not authenticated",
          request,
        });
        peer.close(1008, "Authentication required");
        return;
      }
      await runPeerScoped(peer, async () => {
        if (request.type === "host.lifecycle.subscribe") {
          subscribeHostLifecycle(peer);
        } else if (request.type === "host.lifecycle.unsubscribe") {
          unsubscribeHostLifecycle(peer);
        } else if (request.type === "thread.subscribe") {
          await subscribeThread(peer, request);
        } else if (request.type === "thread.unsubscribe") {
          unsubscribeThread(peer, request);
        } else if (request.type === "ping") {
          send(peer, { type: "pong", nonce: request.nonce });
        }
      });
    } catch (error: any) {
      send(peer, {
        type: "error",
        message: error?.message || "Realtime message failed",
        request,
      });
    }
  },

  close(peer) {
    cleanup(peer);
  },

  error(peer) {
    cleanup(peer);
  },
});
