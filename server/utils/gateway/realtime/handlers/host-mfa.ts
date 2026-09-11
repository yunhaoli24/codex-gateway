import type { RealtimeClientMessage } from "~~/shared/types";
import { hostMfaManager } from "../../host-mfa/host-mfa-instance";
import { hostRuntimeSupervisor } from "../../runtime/host-runtime-supervisor";
import {
  authenticatedUserId,
  sendRealtimePeerMessage,
  stateFor,
  type RealtimePeer,
} from "../peer-state";

export function subscribeHostMfa(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.hostMfaUnsubscribe?.();
  const userId = authenticatedUserId(peer);
  const sendRequest = (event: ReturnType<typeof hostMfaManager.pendingRequestsForUser>[number]) => {
    sendRealtimePeerMessage(peer, {
      type: "host.mfa.request",
      hostId: event.hostId,
      name: event.name,
      instructions: event.instructions,
      prompts: event.prompts,
    });
  };
  state.hostMfaUnsubscribe = hostMfaManager.events.subscribe(userId, sendRequest);

  // SSH authentication can challenge immediately after a Host is saved, while a browser may be
  // reconnecting its realtime session after the same config update. MFA is durable pending state,
  // not a fire-and-forget notification, so replay it when the authenticated peer subscribes.
  for (const request of hostMfaManager.pendingRequestsForUser(userId)) sendRequest(request);
}

export function handleHostMfaConnect(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "host.mfa.connect" }>,
) {
  hostRuntimeSupervisor.connectOnDemand(authenticatedUserId(peer), request.hostId);
}

export function handleHostMfaSubmit(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "host.mfa.submit" }>,
) {
  const userId = authenticatedUserId(peer);
  hostMfaManager.submitMfa(userId, request.hostId, request.code);
}

export function handleHostMfaCancel(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "host.mfa.cancel" }>,
) {
  hostMfaManager.cancelMfa(authenticatedUserId(peer), request.hostId);
}
