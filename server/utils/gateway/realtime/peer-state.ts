import type { RealtimeServerMessage } from "~~/shared/types";
import { runWithGatewayUser } from "../state/memory";

export interface RealtimePeer {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  context: Record<string, any>;
}

export interface RealtimePeerState {
  authenticated: boolean;
  userId: number | null;
  authTimer?: ReturnType<typeof setTimeout>;
  hostLifecycleUnsubscribe?: () => void;
  terminalUnsubscribe?: () => void;
  notificationUnsubscribe?: () => void;
  pinnedThreadsUnsubscribe?: () => void;
  browserPreviewUnsubscribe?: () => void;
  browserOwnerId?: string;
  sessionRevocationUnsubscribe?: () => void;
  threadUnsubscribers: Map<string, () => void>;
}

export function sendRealtimePeerMessage(peer: RealtimePeer, message: RealtimeServerMessage) {
  peer.send(JSON.stringify(message));
}

export function stateFor(peer: RealtimePeer) {
  let state = peer.context.realtime as RealtimePeerState | undefined;
  if (!state) {
    state = { authenticated: false, userId: null, threadUnsubscribers: new Map() };
    peer.context.realtime = state;
  }
  return state;
}

export function runPeerScoped<T>(peer: RealtimePeer, callback: () => T): T {
  const userId = stateFor(peer).userId;
  if (!userId) {
    throw new Error("Realtime connection is not authenticated");
  }
  return runWithGatewayUser(userId, callback);
}

export function authenticatedUserId(peer: RealtimePeer) {
  const userId = stateFor(peer).userId;
  if (!userId) {
    throw new Error("Realtime connection is not authenticated");
  }
  return userId;
}

export function threadTopicKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}
