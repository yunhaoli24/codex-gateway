import { randomUUID } from "node:crypto";
import type { RealtimeClientMessage } from "~~/shared/types";
import { userStore } from "../../auth/users";
import { sessionRevocationEvents } from "../../auth/session-events";
import { hashToken } from "../../storage/crypto";
import { subscribeTerminalEvents } from "./terminal";
import { sendRealtimePeerMessage, stateFor, type RealtimePeer } from "../peer-state";

export function authenticatePeer(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "auth.authenticate" }>,
) {
  const current = stateFor(peer);
  if (current.authenticated) {
    throw new Error("Realtime connection is already authenticated");
  }
  const token = String(request.token || "");
  const user = userStore.authenticateToken(token);
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
    sessionRevocationUnsubscribe: sessionRevocationEvents.subscribe(hashToken(token), () => {
      peer.close(1008, "Session revoked");
    }),
  };
  sendRealtimePeerMessage(peer, { type: "ready", connectionId: randomUUID() });
  subscribeTerminalEvents(peer);
}
