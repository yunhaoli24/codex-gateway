import { captureSessionEpoch } from "@/utils/session-epoch";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import {
  requestActivateThreadSnapshot,
  type ThreadSnapshotActivationInput,
  type ThreadSnapshotMessage,
} from "./transport";

interface ThreadSnapshotStrategy<Result> {
  input: ThreadSnapshotActivationInput;
  setLoading?: (loading: boolean) => void;
  accept: (snapshot: ThreadSnapshotMessage) => boolean;
  commit: (snapshot: ThreadSnapshotMessage) => Result | Promise<Result>;
  discard?: (snapshot: ThreadSnapshotMessage) => void;
  fail: (error: unknown) => void;
  rethrow?: boolean;
}

/**
 * Runs the one authoritative thread.activate transaction. View-specific code supplies only its
 * acceptance and commit policy; session invalidation, loading ownership, failure handling, and
 * late-result disposal stay identical across selection, preview, refresh, and gap recovery.
 */
export async function coordinateThreadSnapshot<Result>(
  strategy: ThreadSnapshotStrategy<Result>,
): Promise<Result | undefined> {
  const sessionIsCurrent = captureSessionEpoch();
  strategy.setLoading?.(true);
  try {
    const snapshot = await requestActivateThreadSnapshot(strategy.input);
    if (!sessionIsCurrent() || !strategy.accept(snapshot)) {
      if (sessionIsCurrent()) strategy.discard?.(snapshot);
      return undefined;
    }
    // External writers cannot publish through our app-server connection. Keep read-only views
    // out of reconnect subscriptions; otherwise reconnect would resume them and hit the same lock.
    const realtime = useGatewayRealtimeStore();
    if (snapshot.readOnly === true) {
      realtime.cancelThreadEvents(snapshot.hostId, snapshot.threadId);
    } else {
      realtime.rememberThreadSubscription(
        snapshot.hostId,
        snapshot.threadId,
        snapshot.lastEventId,
        snapshot.eventEpoch,
      );
    }
    return await strategy.commit(snapshot);
  } catch (error: unknown) {
    if (!sessionIsCurrent()) return undefined;
    strategy.fail(error);
    if (strategy.rethrow === true) throw error;
    return undefined;
  } finally {
    if (sessionIsCurrent()) strategy.setLoading?.(false);
  }
}
