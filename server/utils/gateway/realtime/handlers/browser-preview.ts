import type { RealtimeClientMessage } from "~~/shared/types";
import { browserPreviewEvents } from "../../browser-preview/browser-preview-events";
import { browserPreviewManager } from "../../browser-preview/browser-preview-manager";
import { hostStore } from "../../state/hosts";
import {
  authenticatedUserId,
  runPeerScoped,
  sendRealtimePeerMessage,
  stateFor,
  type RealtimePeer,
} from "../peer-state";

export function openBrowserPreview(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "browser.open" }>,
) {
  const state = stateFor(peer);
  const host = runPeerScoped(peer, () => hostStore.getWithSecret(request.hostId));
  if (!host) throw new Error(`Host ${request.hostId} is unavailable`);
  const session = browserPreviewManager.open(
    requireOwnerId(state.browserOwnerId),
    authenticatedUserId(peer),
    host,
    request,
  );
  sendRealtimePeerMessage(peer, { type: "browser.opened", requestId: request.requestId, session });
}

export function closeBrowserPreview(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "browser.close" }>,
) {
  browserPreviewManager.close(authenticatedUserId(peer), request.sessionId);
  sendRealtimePeerMessage(peer, {
    type: "browser.closed",
    requestId: request.requestId,
    sessionId: request.sessionId,
  });
}

export function allowInsecureBrowserPreviewTls(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "browser.allowInsecureTls" }>,
) {
  const session = browserPreviewManager.setInsecureTls(
    authenticatedUserId(peer),
    request.sessionId,
    request.allowInsecureTls,
  );
  sendRealtimePeerMessage(peer, { type: "browser.opened", requestId: request.requestId, session });
}

export function subscribeBrowserPreviewEvents(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.browserPreviewUnsubscribe?.();
  state.browserPreviewUnsubscribe = browserPreviewEvents.subscribe(
    authenticatedUserId(peer),
    (event) => {
      sendRealtimePeerMessage(peer, {
        type: "browser.framePolicyWarning",
        sessionId: event.sessionId,
        policy: event.policy,
        value: event.value,
      });
    },
  );
}

function requireOwnerId(ownerId: string | undefined) {
  if (!ownerId) throw new Error("Browser preview owner is unavailable");
  return ownerId;
}
