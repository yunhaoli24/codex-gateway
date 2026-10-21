import type { RealtimeServerMessage } from "~~/shared/types";
import { runWithGatewayUser } from "../state/memory";
import type { OwnedSubscription } from "./subscription-map";
import { gatewayLog } from "../logging";

const MAX_QUEUED_REALTIME_BYTES = 8 * 1024 * 1024;

export interface RealtimePeer {
  send(message: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  context: Record<string, unknown>;
  bufferedAmount?: number;
  waitForDrain?: (options?: { threshold?: number; signal?: AbortSignal }) => Promise<void>;
}

export interface RealtimePeerState {
  authenticated: boolean;
  deliveryClosed?: boolean;
  userId: number | null;
  sessionTokenHash: string | null;
  authTimer?: ReturnType<typeof setTimeout>;
  hostLifecycleUnsubscribe?: () => void;
  terminalUnsubscribe?: () => void;
  terminalOutputStream?: { dispose: () => void };
  notificationUnsubscribe?: () => void;
  pinnedThreadsUnsubscribe?: () => void;
  threadRuntimeStatusUnsubscribe?: () => void;
  browserPreviewUnsubscribe?: () => void;
  browserOwnerId?: string;
  sessionRevocationUnsubscribe?: () => void;
  threadUnsubscribers: Map<string, () => void>;
  hostMetricsUnsubscribers: Map<number, () => void>;
  tmuxSessionUnsubscribers: Map<number, () => void>;
  fileWatchUnsubscribers: Map<string, OwnedSubscription>;
  hostMfaUnsubscribe?: () => void;
}

const peerStates = new WeakMap<RealtimePeer, RealtimePeerState>();

export function sendRealtimePeerMessage(peer: RealtimePeer, message: RealtimeServerMessage) {
  const state = stateFor(peer);
  if (state.deliveryClosed === true) return;
  const bufferedBytes = peer.bufferedAmount ?? 0;
  if (bufferedBytes > MAX_QUEUED_REALTIME_BYTES) {
    // CrossWS/ws already exposes the actual transport queue. Do not accumulate a second JS
    // queue or stall the shared App Server event loop for a slow/suspended browser. Reconnect
    // replays the existing event cursor (or activates a snapshot after a gap), never silently
    // drops individual deltas. This bounds pending delivery, not conversation/history length.
    state.deliveryClosed = true;
    gatewayLog("warn", "gateway", "realtime slow consumer disconnected", {
      userId: state.userId,
      bufferedBytes,
      messageType: message.type,
    });
    peer.close(1013, "Realtime client is not consuming messages");
    return;
  }
  peer.send(JSON.stringify(message));
}

export function stateFor(peer: RealtimePeer) {
  let state = peerStates.get(peer);
  if (state === undefined) {
    state = {
      authenticated: false,
      userId: null,
      sessionTokenHash: null,
      threadUnsubscribers: new Map(),
      hostMetricsUnsubscribers: new Map(),
      tmuxSessionUnsubscribers: new Map(),
      fileWatchUnsubscribers: new Map(),
    };
    peerStates.set(peer, state);
  }
  return state;
}

export function runPeerScoped<T>(peer: RealtimePeer, callback: () => T): T {
  const userId = stateFor(peer).userId;
  if (userId === null) {
    throw new Error("Realtime connection is not authenticated");
  }
  return runWithGatewayUser(userId, callback);
}

export function authenticatedUserId(peer: RealtimePeer) {
  const userId = stateFor(peer).userId;
  if (userId === null) {
    throw new Error("Realtime connection is not authenticated");
  }
  return userId;
}

export function threadTopicKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}
