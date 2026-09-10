import type { GatewayEvent } from "~~/shared/types";
import type { AgentEvent } from "~~/shared/agent/events";
import type { ProviderAdapter, ProviderNotification } from "../agent/provider-adapter";
import { gatewayEventStore } from "../state/gateway-events";
import { currentGatewayUserId } from "../state/memory";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { dispatchThreadRuntimeNotification } from "../notifications/thread-notification-dispatcher";
import { applyEventToOpenSnapshot } from "./open-snapshot-events";
import { runtimeStatusFromEvent } from "~~/shared/thread-runtime-status";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import { threadRuntimeStatusHub } from "./thread-runtime-status-hub";
import { runtimeLog } from "./runtime-log";

type ThreadEventSubscriber = (event: GatewayEvent) => void;
export type ThreadGoalResolver = () => Promise<unknown>;
export type ThreadMetadataResolver = () => Promise<unknown>;

export interface ThreadRuntimeRecordOptions {
  resolveGoal?: ThreadGoalResolver;
  resolveThread?: ThreadMetadataResolver;
}

class ThreadRuntimeEventBus {
  private readonly subscribers = new Map<string, Set<ThreadEventSubscriber>>();

  /**
   * Map one provider notification through the adapter bound to its Host
   * session. The runtime never chooses a provider or stores raw protocol
   * methods; a provider no-op is intentionally not recorded.
   */
  recordNotification(
    hostId: number,
    threadId: string,
    notification: ProviderNotification,
    provider: ProviderAdapter,
    options: ThreadRuntimeRecordOptions = {},
  ) {
    const mapped = provider.mapNotification(notification);
    if (mapped.kind === "ignored") return null;
    if (mapped.kind === "rejected") {
      runtimeLog("provider notification rejected", {
        provider: provider.id,
        hostId,
        threadId,
        method: mapped.method,
        code: mapped.code,
        message: mapped.message,
      });
      return null;
    }
    return this.record(hostId, threadId, mapped.event, mapped.emittedAtMs, options);
  }

  record(
    hostId: number,
    threadId: string,
    event: AgentEvent,
    emittedAtMs?: number,
    options: ThreadRuntimeRecordOptions = {},
  ) {
    const emittedAt = emittedAtMs === undefined ? null : new Date(emittedAtMs);
    const createdAt =
      emittedAt !== null && Number.isFinite(emittedAt.getTime())
        ? emittedAt.toISOString()
        : new Date().toISOString();
    const gatewayEvent = gatewayEventStore.add(hostId, threadId, event, createdAt);
    subAgentThreadStore.recordRuntimeEvent(hostId, threadId, event);
    threadSnapshotStore.update(hostId, threadId, (snapshot) =>
      applyEventToOpenSnapshot(snapshot, event),
    );
    this.publish(gatewayEvent);
    this.publishRuntimeStatus(gatewayEvent);
    dispatchThreadRuntimeNotification(gatewayEvent, options);
    return gatewayEvent;
  }

  subscribe(hostId: number, threadId: string, subscriber: ThreadEventSubscriber) {
    const key = this.key(currentUserId(), hostId, threadId);
    let subscribers = this.subscribers.get(key);
    if (subscribers === undefined) {
      subscribers = new Set();
      this.subscribers.set(key, subscribers);
    }
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        this.subscribers.delete(key);
      }
    };
  }

  private publish(event: GatewayEvent) {
    for (const subscriber of this.subscribers.get(
      this.key(currentUserId(), event.hostId, event.threadId),
    ) ?? []) {
      subscriber(event);
    }
  }

  private publishRuntimeStatus(event: GatewayEvent) {
    const status = runtimeStatusFromEvent(event);
    if (status === null) return;
    let turnId: string | null = null;
    const canonicalEvent = event.event;
    if (canonicalEvent.type === "turn.started" || canonicalEvent.type === "turn.completed") {
      const turn = recordFromUnknown(canonicalEvent.turn);
      const id = idFromUnknown(turn?.id);
      turnId = id !== null ? String(id) : null;
    }
    threadRuntimeStatusHub.publish(currentUserId(), {
      hostId: event.hostId,
      threadId: event.threadId,
      status,
      turnId: status === "running" && turnId !== null ? turnId : null,
    });
  }

  private key(userId: number, hostId: number, threadId: string) {
    return `${userId}:${hostId}:${threadId}`;
  }
}

function currentUserId() {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Thread runtime events require an authenticated user scope");
  }
  return userId;
}

export const threadRuntimeEvents = new ThreadRuntimeEventBus();
