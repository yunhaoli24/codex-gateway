import type { GatewayEvent, HostRecord, RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadOpenSchema, threadStartSchema } from "../../http/validation/threads";
import { threadBroker } from "../../runtime/broker";
import type { ThreadSubscriptionLease } from "../../runtime/controller-registry";
import { threadRuntimeEvents } from "../../runtime/thread-runtime-events";
import { gatewayEventStore } from "../../state/gateway-events";
import { hostStore } from "../../state/hosts";
import { bindGatewayUser } from "../../state/memory";
import { isThreadActiveStatus } from "~~/shared/thread-runtime-status";
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
  const threadId =
    message.threadId === null || message.threadId === undefined ? "" : String(message.threadId);
  if (!Number.isInteger(hostId) || hostId <= 0 || threadId === "") {
    throw new Error("Invalid thread subscription");
  }

  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();

  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  const afterId = Number(message.afterId ?? 0);
  subscribeThreadEvents(peer, host, threadId, afterId, message.afterEpoch);
}

export async function activateThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.activate" }>,
) {
  const input = threadOpenSchema.parse(message);

  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  // Capture the replay cursor before reading the snapshot. Events emitted while thread/read is in
  // flight are then replayed by subscribeThreadEvents; capturing it afterwards would pair an old
  // snapshot with a newer cursor and permanently skip those events.
  const lastEventId = gatewayEventStore.latestId(input.hostId, input.threadId);
  const eventEpoch = gatewayEventStore.epoch(input.hostId);
  const activationLease = threadBroker.retainThreadActivation(host, input.threadId);
  let leaseTransferred = false;
  try {
    const activationController = await activationLease.ready;
    const result = await threadBroker.openThread(
      host,
      input.threadId,
      input.projectId ?? null,
      input.limit,
      activationController,
    );
    sendRealtimePeerMessage(peer, {
      type: "thread.snapshot",
      requestId: message.requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      lastEventId,
      eventEpoch,
      ...result,
    });
    subscribeThreadEvents(
      peer,
      host,
      input.threadId,
      lastEventId,
      eventEpoch,
      result.runtimeStatus === "running",
      { lease: activationLease, controller: activationController },
    );
    leaseTransferred = true;
    if (result.threadSettings === null || result.threadSettings === undefined) {
      // A cache hit can predate settings hydration. Resolve only that metadata after the snapshot;
      // cold opens already obtain it from the combined thread/resume response above.
      void runPeerScoped(peer, () =>
        threadBroker.resolveThreadSettings(host, input.threadId).catch((error: unknown) => {
          recordGatewayError(
            input.hostId,
            input.threadId,
            error,
            "Failed to resolve thread settings",
          );
        }),
      );
    }
  } finally {
    if (!leaseTransferred) activationLease.release();
  }
}

export async function startThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.start" }>,
) {
  const input = threadStartSchema.parse(message);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const result = await threadBroker.startThread(
    host,
    {
      cwd: input.cwd === "" ? undefined : input.cwd,
      model: input.model === "" ? undefined : input.model,
      effort: input.effort === "" ? undefined : input.effort,
      approvalPolicy: input.approvalPolicy ?? undefined,
    },
    input.projectId ?? null,
    input.provider,
  );
  const threadId = String(result.thread.id);
  // A newly started thread can emit notifications before thread/start returns its id. Replaying
  // from zero is safe for a new identity and avoids advancing past those startup events.
  const lastEventId = 0;
  const eventEpoch = gatewayEventStore.epoch(input.hostId);
  sendRealtimePeerMessage(peer, {
    ...result,
    type: "thread.started",
    requestId: message.requestId,
    hostId: input.hostId,
    threadId,
    lastEventId,
    eventEpoch,
  });
}

export function unsubscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.unsubscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId =
    message.threadId === null || message.threadId === undefined ? "" : String(message.threadId);
  if (!Number.isInteger(hostId) || hostId <= 0 || threadId === "") {
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
  afterEpoch?: string,
  initiallyRunning = threadBroker.isThreadRunning(host.id, threadId),
  activation?: {
    lease: ThreadSubscriptionLease;
    controller: Awaited<ThreadSubscriptionLease["ready"]>;
  },
) {
  const hostId = host.id;
  const eventEpoch = gatewayEventStore.epoch(hostId);
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  state.threadUnsubscribers.delete(key);
  // A first subscription has no server epoch yet and starts at zero, so it may consume the
  // current retained stream directly. A non-zero cursor without an epoch cannot prove that its
  // ids belong to this Host generation and must refresh from an authoritative snapshot.
  const epochMismatch = afterEpoch === undefined ? afterId > 0 : afterEpoch !== eventEpoch;
  const replayGap = epochMismatch || gatewayEventStore.hasReplayGap(hostId, threadId, afterId);
  if (replayGap) {
    // Do not attach live delivery until the client activates an authoritative snapshot. Sending
    // live events while that snapshot is in flight lets the later snapshot overwrite newer
    // projections and can also restore the stale pre-gap cursor.
    sendRealtimePeerMessage(peer, {
      type: "thread.events.gap",
      hostId,
      threadId,
      afterId,
      lastEventId: gatewayEventStore.latestId(hostId, threadId),
      eventEpoch,
    });
    return;
  }
  let sentThroughId = afterId;
  let invalidated = false;
  let releaseSubscription = () => {};
  const sendOnce = (event: GatewayEvent) => {
    const currentEpoch = gatewayEventStore.epoch(hostId);
    if (currentEpoch !== eventEpoch) {
      if (!invalidated) {
        invalidated = true;
        sendRealtimePeerMessage(peer, {
          type: "thread.events.gap",
          hostId,
          threadId,
          afterId: sentThroughId,
          lastEventId: gatewayEventStore.latestId(hostId, threadId),
          eventEpoch: currentEpoch,
        });
        releaseSubscription();
      }
      return;
    }
    if (event.id <= sentThroughId) return;
    // Gateway event ids are monotonic within a user's in-memory event store. A high-water cursor
    // provides the same replay/live de-duplication as an ever-growing Set without retaining one
    // allocation for every token emitted during a long-running turn.
    sentThroughId = event.id;
    sendRealtimePeerMessage(peer, { type: "thread.event", event });
  };

  let replaying = true;
  const liveQueue: GatewayEvent[] = [];
  let upstreamLease: ThreadSubscriptionLease | null = null;
  let pendingActivation = activation;

  const ensureUpstreamSubscription = () => {
    if (upstreamLease !== null) return;
    if (pendingActivation !== undefined) {
      const retained = pendingActivation;
      pendingActivation = undefined;
      upstreamLease = retained.lease;
      void runPeerScoped(peer, () =>
        retained.controller.ensureSubscribed().catch((error: unknown) => {
          recordGatewayError(hostId, threadId, error, "Failed to subscribe thread upstream");
          if (upstreamLease === retained.lease) releaseUpstreamSubscription();
        }),
      );
      return;
    }
    const lease = threadBroker.retainUpstreamSubscription(host, threadId, "browser");
    upstreamLease = lease;
    void runPeerScoped(peer, () =>
      lease.ready.catch((error: unknown) => {
        recordGatewayError(hostId, threadId, error, "Failed to subscribe thread upstream");
        if (upstreamLease === lease) releaseUpstreamSubscription();
      }),
    );
  };

  const releaseUpstreamSubscription = () => {
    upstreamLease?.release();
    upstreamLease = null;
  };

  if (initiallyRunning) ensureUpstreamSubscription();
  else {
    // A cold resume subscribes as part of returning initialTurnsPage. Idle threads do not need a
    // retained upstream subscription, so release the activation lease after the snapshot and let
    // the global thread/started broadcast reacquire one when work begins.
    pendingActivation?.lease.release();
    pendingActivation = undefined;
  }

  const unsubscribe = threadRuntimeEvents.subscribe(
    hostId,
    threadId,
    bindGatewayUser((event) => {
      updateBrowserUpstreamLease(event, ensureUpstreamSubscription, releaseUpstreamSubscription);
      if (replaying) {
        liveQueue.push(event);
        return;
      }
      sendOnce(event);
    }),
  );
  releaseSubscription = () => {
    unsubscribe();
    pendingActivation?.lease.release();
    pendingActivation = undefined;
    releaseUpstreamSubscription();
    if (state.threadUnsubscribers.get(key) === releaseSubscription) {
      state.threadUnsubscribers.delete(key);
    }
  };
  state.threadUnsubscribers.set(key, releaseSubscription);

  // Each thread cache is bounded to 500 events. Replay the complete retained window rather than
  // silently stopping at an arbitrary first 200; selected views refresh their authoritative
  // snapshot on reconnect and cached views refresh when activated if an older gap was pruned.
  for (const event of gatewayEventStore.list(hostId, threadId, afterId, 500)) {
    sendOnce(event);
  }
  replaying = false;
  for (const event of liveQueue) {
    sendOnce(event);
  }
  liveQueue.length = 0;
}

function recordGatewayError(hostId: number, threadId: string, error: unknown, fallback: string) {
  threadRuntimeEvents.record(hostId, threadId, {
    type: "gateway.error",
    message: error instanceof Error ? error.message : fallback,
  });
}

function updateBrowserUpstreamLease(event: GatewayEvent, retain: () => void, release: () => void) {
  if (event.event.type === "turn.started") {
    retain();
    return;
  }
  if (event.event.type === "turn.completed") {
    // The app-server emits turn/completed before it finishes persisting a first-turn rollout and
    // before the authoritative thread status becomes idle. Keep the lease until
    // thread/status/changed confirms the thread is no longer active so final persistence and Goal
    // continuation notifications remain on the same uninterrupted subscription.
    return;
  }
  if (event.event.type !== "thread.status.changed") return;
  if (isThreadActiveStatus(event.event.status)) {
    retain();
    return;
  }
  release();
}
