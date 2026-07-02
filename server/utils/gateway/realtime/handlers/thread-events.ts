import type { GatewayEvent, HostRecord, RealtimeClientMessage } from "~~/shared/types";
import { requireRecord, threadOpenSchema } from "../../http/validation";
import { threadBroker } from "../../runtime/broker";
import { threadRuntimeEvents } from "../../runtime/thread-runtime-events";
import { gatewayEventStore } from "../../state/gateway-events";
import { hostStore } from "../../state/hosts";
import { bindGatewayUser } from "../../state/memory";
import {
  runPeerScoped,
  sendRealtimePeerMessage,
  stateFor,
  threadTopicKey,
  type RealtimePeer,
} from "../peer-state";

export async function subscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.subscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId = String(message.threadId || "");
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    throw new Error("Invalid thread subscription");
  }

  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();

  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  const afterId = Number(message.afterId || 0);
  subscribeThreadEvents(peer, host, threadId, afterId);
}

export async function activateThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.activate" }>,
) {
  const input = threadOpenSchema.parse(message);

  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const result = await threadBroker.openThread(
    host,
    input.threadId,
    input.projectId ?? null,
    input.limit,
  );
  const lastEventId = gatewayEventStore.latestId(input.hostId, input.threadId);
  sendRealtimePeerMessage(peer, {
    type: "thread.snapshot",
    requestId: message.requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    lastEventId,
    ...result,
  });
  subscribeThreadEvents(peer, host, input.threadId, lastEventId);
}

export function unsubscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.unsubscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId = String(message.threadId || "");
  if (!Number.isInteger(hostId) || hostId <= 0 || !threadId) {
    return;
  }
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  state.threadUnsubscribers.delete(key);
}

function subscribeThreadEvents(
  peer: RealtimePeer,
  host: HostRecord,
  threadId: string,
  afterId: number,
) {
  const hostId = host.id;
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  const sentEventIds = new Set<number>();
  const sendOnce = (event: GatewayEvent) => {
    if (event.id <= afterId || sentEventIds.has(event.id)) {
      return;
    }
    sentEventIds.add(event.id);
    sendRealtimePeerMessage(peer, { type: "thread.event", event });
  };

  let replaying = true;
  const liveQueue: GatewayEvent[] = [];
  const unsubscribe = threadRuntimeEvents.subscribe(
    hostId,
    threadId,
    bindGatewayUser((event) => {
      if (replaying) {
        liveQueue.push(event);
        return;
      }
      sendOnce(event);
    }),
  );
  state.threadUnsubscribers.set(key, unsubscribe);

  void runPeerScoped(peer, () =>
    threadBroker.ensureUpstreamSubscribed(host, threadId).catch((error: any) => {
      threadRuntimeEvents.record(hostId, threadId, "gateway/error", {
        method: "gateway/error",
        params: {
          message: error?.message || "Failed to subscribe thread upstream",
        },
      });
    }),
  );

  for (const event of gatewayEventStore.list(hostId, threadId, afterId, 200)) {
    sendOnce(event);
  }
  replaying = false;
  for (const event of liveQueue) {
    sendOnce(event);
  }
  liveQueue.length = 0;
}
