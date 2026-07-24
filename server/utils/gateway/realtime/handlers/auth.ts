import { randomUUID } from "node:crypto";
import type { RealtimeClientMessage } from "~~/shared/types";
import { userStore } from "../../auth/users";
import { notificationRealtimeEvents } from "../../notifications/notification-realtime-events";
import { pinnedThreadEvents } from "../../config/pinned-thread-events";
import { sessionRevocationEvents } from "../../auth/session-events";
import { hashToken } from "../../storage/crypto";
import { subscribeTerminalEvents } from "./terminal";
import { subscribeBrowserPreviewEvents } from "./browser-preview";
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
  const connectionId = randomUUID();
  peer.context.realtime = {
    authenticated: true,
    userId: user.id,
    threadUnsubscribers: new Map(),
    browserOwnerId: connectionId,
    sessionRevocationUnsubscribe: sessionRevocationEvents.subscribe(hashToken(token), () => {
      peer.close(1008, "Session revoked");
    }),
    notificationUnsubscribe: notificationRealtimeEvents.subscribe(user.id, (notification) => {
      sendRealtimePeerMessage(peer, { type: "notification.published", notification });
    }),
    pinnedThreadsUnsubscribe: pinnedThreadEvents.subscribe(user.id, () => {
      sendRealtimePeerMessage(peer, { type: "config.pinnedThreads.changed" });
    }),
  };
  sendRealtimePeerMessage(peer, { type: "ready", connectionId });
  subscribeTerminalEvents(peer);
  subscribeBrowserPreviewEvents(peer);
}
