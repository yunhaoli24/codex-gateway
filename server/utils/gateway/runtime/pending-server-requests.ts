import type { GatewayEvent, RpcEnvelope } from "~~/shared/types";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import { currentGatewayUserId } from "../state/memory";

const MAX_PENDING_SERVER_REQUESTS = 1_000;

class PendingServerRequestRegistry {
  private readonly keysByUser = new Map<number, Map<string, true>>();

  track(hostId: number, threadId: string, request: RpcEnvelope) {
    const requestId = idFromUnknown(request.id);
    if (requestId === null) return;
    const keys = this.currentUserKeys();
    keys.set(this.key(hostId, threadId, requestId), true);
    while (keys.size > MAX_PENDING_SERVER_REQUESTS) {
      const oldest = keys.keys().next().value;
      if (oldest === undefined) break;
      keys.delete(oldest);
    }
  }

  resolve(hostId: number, threadId: string, requestId: string | number) {
    this.currentUserKeys().delete(this.key(hostId, threadId, requestId));
  }

  resolveFromNotification(hostId: number, threadId: string, notification: RpcEnvelope) {
    if (notification.method !== "serverRequest/resolved") return;
    const requestId = idFromUnknown(recordFromUnknown(notification.params)?.requestId);
    if (requestId !== null) this.resolve(hostId, threadId, requestId);
  }

  isPending(event: GatewayEvent) {
    if (event.event.type !== "serverRequest.requested") return false;
    const requestId = event.event.requestId;
    return (
      requestId !== null &&
      requestId !== undefined &&
      this.currentUserKeys().has(this.key(event.hostId, event.threadId, requestId))
    );
  }

  deleteHost(userId: number, hostId: number) {
    const keys = this.keysByUser.get(userId);
    if (keys === undefined) return;
    const prefix = `${hostId}:`;
    for (const key of keys.keys()) {
      if (key.startsWith(prefix)) keys.delete(key);
    }
    if (keys.size === 0) this.keysByUser.delete(userId);
  }

  private key(hostId: number, threadId: string, requestId: string | number) {
    return `${hostId}:${threadId}:${requestId}`;
  }

  private currentUserKeys() {
    const userId = currentGatewayUserId();
    if (userId === null) throw new Error("Server request tracking requires a user scope");
    let keys = this.keysByUser.get(userId);
    if (keys === undefined) {
      keys = new Map();
      this.keysByUser.set(userId, keys);
    }
    return keys;
  }
}

export const pendingServerRequests = new PendingServerRequestRegistry();
