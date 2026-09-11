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
import { threadRuntimeStatusHub } from "../../runtime/thread-runtime-status-hub";
import { subscribeHostMfa } from "./host-mfa";

export function authenticatePeer(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "auth.authenticate" }>,
) {
  const current = stateFor(peer);
  if (current.authenticated) {
    throw new Error("Realtime connection is already authenticated");
  }
  const token = request.token;
  const user = userStore.authenticateToken(token);
  if (user === null) {
    // Authentication failure is terminal for this socket. Closing with the WebSocket policy code
    // gives every client one transport-level signal to clear its session instead of reconnecting
    // forever and surfacing repeated "invalid token" notifications.
    peer.close(1008, "Invalid or expired session");
    return;
  }
  if (current.authTimer !== undefined) {
    clearTimeout(current.authTimer);
  }
  const connectionId = randomUUID();
  Object.assign(current, {
    authenticated: true,
    userId: user.id,
    threadUnsubscribers: new Map(),
    hostMetricsUnsubscribers: new Map(),
    tmuxSessionUnsubscribers: new Map(),
    fileWatchUnsubscribers: new Map(),
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
    threadRuntimeStatusUnsubscribe: threadRuntimeStatusHub.subscribe(user.id, (update) => {
      sendRealtimePeerMessage(peer, { type: "thread.runtime.updated", update });
    }),
  });
  sendRealtimePeerMessage(peer, { type: "ready", connectionId });
  sendRealtimePeerMessage(peer, {
    type: "thread.runtime.snapshot",
    statuses: threadRuntimeStatusHub.snapshot(user.id),
  });
  subscribeTerminalEvents(peer);
  subscribeBrowserPreviewEvents(peer);
  subscribeHostMfa(peer);
}
