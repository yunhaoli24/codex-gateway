import { randomUUID } from "node:crypto";
import type { RealtimeClientMessage } from "~~/shared/types";
import { userStore } from "../../auth/users";
import { sendRealtimePeerMessage, stateFor, type RealtimePeer } from "../peer-state";

export function authenticatePeer(
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
  };
  sendRealtimePeerMessage(peer, { type: "ready", connectionId: randomUUID() });
}
