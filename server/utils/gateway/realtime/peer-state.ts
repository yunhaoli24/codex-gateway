import type { RealtimeServerMessage } from "~~/shared/types";
import { runWithGatewayUser } from "../state/memory";
import type { OwnedSubscription } from "./subscription-map";

export interface RealtimePeer {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  context: Record<string, unknown>;
}

export interface RealtimePeerState {
  authenticated: boolean;
  userId: number | null;
  authTimer?: ReturnType<typeof setTimeout>;
  hostLifecycleUnsubscribe?: () => void;
  terminalUnsubscribe?: () => void;
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
  peer.send(JSON.stringify(message));
}

export function stateFor(peer: RealtimePeer) {
  let state = peerStates.get(peer);
  if (state === undefined) {
    state = {
      authenticated: false,
      userId: null,
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
