import { hostLifecycleBus } from "../../state/host-events";
import { sendRealtimePeerMessage, stateFor, type RealtimePeer } from "../peer-state";

export function subscribeHostLifecycle(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = hostLifecycleBus.subscribe((event) => {
    sendRealtimePeerMessage(peer, { type: "host.lifecycle", event });
  });
}

export function unsubscribeHostLifecycle(peer: RealtimePeer) {
  const state = stateFor(peer);
  state.hostLifecycleUnsubscribe?.();
  state.hostLifecycleUnsubscribe = undefined;
}
