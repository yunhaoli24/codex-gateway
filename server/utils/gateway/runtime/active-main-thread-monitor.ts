import pLimit from "p-limit";
import type { HostRecord } from "~~/shared/types";
import { isThreadActiveStatus } from "~~/shared/thread-runtime-status";
import type { CodexRpcClient } from "../infra/rpc";
import { gatewayEventStore } from "../state/gateway-events";
import { currentGatewayUserId } from "../state/memory";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadBroker } from "./broker";
import { threadRuntimeEvents } from "./thread-runtime-events";
import { runtimeLog } from "./runtime-log";

const THREAD_READ_CONCURRENCY = 4;
const RPC_TIMEOUT_MS = 30_000;
type HostRpcClient = CodexRpcClient;

interface ObservedThread {
  threadId: string;
}

/**
 * Observes main threads already loaded by the remote app-server process.
 *
 * App-server subscriptions are connection-scoped. A thread resumed by VS Code can
 * therefore be active without Gateway receiving its events. This monitor discovers
 * only currently loaded active threads, attaches Gateway's existing Host RPC
 * connection, and releases monitor-only subscriptions once the turn becomes idle.
 *
 * The map is deliberately process-local: app-server remains the state authority,
 * while persisting observation state would turn a Gateway restart into stale
 * completion notifications for turns that ended while Gateway was offline.
 */
class ActiveMainThreadMonitor {
  private readonly observedByHost = new Map<string, Map<string, ObservedThread>>();
  private readonly pendingScans = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();

  async refreshHost(host: HostRecord) {
    const key = this.hostKey(host.id);
    const pending = this.pendingScans.get(key);
    if (pending) {
      return pending;
    }

    const generation = this.generation(key);
    const scan = this.performRefresh(host, key, generation).finally(() => {
      if (this.pendingScans.get(key) === scan) {
        this.pendingScans.delete(key);
      }
    });
    this.pendingScans.set(key, scan);
    return scan;
  }

  forgetHost(userId: number, hostId: number) {
    const key = this.hostKey(hostId, userId);
    this.generations.set(key, this.generation(key) + 1);
    this.observedByHost.delete(key);
    this.pendingScans.delete(key);
  }

  private async performRefresh(host: HostRecord, key: string, generation: number) {
    const client = await threadBroker.getHostClient(host);
    const observed = this.observedByHost.get(key) ?? new Map<string, ObservedThread>();
    const activeThreadIds = await this.activeMainThreadIds(client, host.id);

    if (!this.isCurrent(key, generation)) {
      return;
    }

    for (const threadId of activeThreadIds) {
      if (observed.has(threadId)) {
        continue;
      }
      try {
        await this.subscribe(client, host, threadId);
      } catch (error) {
        // A turn can end after thread/read reported active but before resume reaches
        // app-server. Treat that narrow race like a lost realtime completion instead
        // of abandoning the notification until another user action happens.
        runtimeLog("active main thread subscribe failed", {
          hostId: host.id,
          hostName: host.name,
          threadId,
          message: error instanceof Error ? error.message : String(error),
        });
        if (!this.isCurrent(key, generation)) {
          return;
        }
        await this.finalizeObservedThread(client, host, { threadId });
        continue;
      }
      if (!this.isCurrent(key, generation)) {
        return;
      }
      observed.set(threadId, { threadId });
    }

    for (const [threadId, thread] of observed) {
      if (activeThreadIds.has(threadId)) {
        continue;
      }
      observed.delete(threadId);
      await this.finalizeObservedThread(client, host, thread);
      if (!this.isCurrent(key, generation)) {
        return;
      }
    }

    if (!this.isCurrent(key, generation)) {
      return;
    }
    if (observed.size) {
      this.observedByHost.set(key, observed);
    } else {
      this.observedByHost.delete(key);
    }
  }

  private async activeMainThreadIds(client: HostRpcClient, hostId: number) {
    const threadIds = await loadedThreadIds(client);
    const limit = pLimit(THREAD_READ_CONCURRENCY);
    const reads = await Promise.all(
      threadIds.map((threadId) => limit(() => readActiveMainThread(client, hostId, threadId))),
    );
    return new Set(reads.filter((threadId): threadId is string => Boolean(threadId)));
  }

  private async subscribe(client: HostRpcClient, host: HostRecord, threadId: string) {
    // Do not create a ThreadController here. The monitor only needs an upstream
    // listener; materializing a UI snapshot would grow thread caches for hidden work.
    await client.request("thread/resume", { threadId, excludeTurns: true }, RPC_TIMEOUT_MS);
    runtimeLog("subscribed to active main thread", {
      hostId: host.id,
      hostName: host.name,
      threadId,
    });
  }

  private async finalizeObservedThread(
    client: HostRpcClient,
    host: HostRecord,
    thread: ObservedThread,
  ) {
    try {
      const latestTurn = await latestTerminalTurn(client, thread.threadId);
      if (latestTurn && !hasRecordedCompletion(host.id, thread.threadId, latestTurn.id)) {
        // The primary path is app-server's turn/completed notification. This fallback
        // covers a transport reconnect between the remote turn ending and its event
        // reaching Gateway. Both paths retain the same turn id, so notification-center
        // deduplication keeps browser and Bark delivery singular.
        threadRuntimeEvents.record(
          host.id,
          thread.threadId,
          "turn/completed",
          {
            method: "turn/completed",
            params: { threadId: thread.threadId, turn: latestTurn },
          },
          {
            resolveGoal: () => client.request("thread/goal/get", { threadId: thread.threadId }),
            resolveThread: () =>
              client.request("thread/read", { threadId: thread.threadId, includeTurns: false }),
          },
        );
      }
    } catch (error) {
      runtimeLog("active main thread completion fallback failed", {
        hostId: host.id,
        hostName: host.name,
        threadId: thread.threadId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.unsubscribeMonitorOnlyThread(client, host, thread.threadId);
    }
  }

  private async unsubscribeMonitorOnlyThread(
    client: HostRpcClient,
    host: HostRecord,
    threadId: string,
  ) {
    // Controllers are shared with visible Gateway threads on this same RPC connection.
    // Unsubscribing a thread with a controller would silently stop its UI event stream.
    if (threadBroker.hasController(host.id, threadId)) {
      return;
    }
    await client.request("thread/unsubscribe", { threadId }, 5_000).catch((error) => {
      runtimeLog("monitor-only thread unsubscribe failed", {
        hostId: host.id,
        hostName: host.name,
        threadId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private hostKey(hostId: number, userId = requiredUserId()) {
    return `${userId}:${hostId}`;
  }

  private generation(key: string) {
    return this.generations.get(key) ?? 0;
  }

  private isCurrent(key: string, generation: number) {
    return this.generation(key) === generation;
  }
}

async function loadedThreadIds(client: HostRpcClient) {
  const threadIds: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { data?: unknown; nextCursor?: unknown } = await client.request(
      "thread/loaded/list",
      { cursor, limit: 100 },
      RPC_TIMEOUT_MS,
    );
    for (const threadId of Array.isArray(page.data) ? page.data : []) {
      if (typeof threadId === "string" && threadId.trim()) {
        threadIds.push(threadId);
      }
    }
    const nextCursor: string | null = typeof page.nextCursor === "string" ? page.nextCursor : null;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return threadIds;
}

async function readActiveMainThread(client: HostRpcClient, hostId: number, threadId: string) {
  try {
    const result = await client.request<any>(
      "thread/read",
      { threadId, includeTurns: false },
      RPC_TIMEOUT_MS,
    );
    const thread = result?.thread ?? result;
    if (thread && typeof thread === "object") {
      threadMetadataStore.record(hostId, null, thread);
    }
    if (!isThreadActiveStatus(thread?.status) || parentThreadId(thread) !== null) {
      return null;
    }
    return threadId;
  } catch (error) {
    runtimeLog("active main thread inspection failed", {
      threadId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function latestTerminalTurn(client: HostRpcClient, threadId: string) {
  const result = await client.request<{ data?: unknown }>(
    "thread/turns/list",
    { threadId, limit: 1, sortDirection: "desc", itemsView: "summary" },
    RPC_TIMEOUT_MS,
  );
  const turn = Array.isArray(result.data) ? result.data[0] : null;
  if (!turn || typeof turn !== "object" || !isTerminalTurn(turn)) {
    return null;
  }
  return turn as { id: string; status: string };
}

function hasRecordedCompletion(hostId: number, threadId: string, turnId: string) {
  return gatewayEventStore.list(hostId, threadId, 0, 500).some((event) => {
    if (event.method !== "turn/completed") {
      return false;
    }
    const completedTurnId = (event.payload as any)?.params?.turn?.id;
    return completedTurnId === turnId;
  });
}

function isTerminalTurn(turn: any): turn is { id: string; status: string } {
  return (
    typeof turn.id === "string" &&
    typeof turn.status === "string" &&
    ["completed", "failed", "interrupted"].includes(turn.status)
  );
}

function parentThreadId(thread: any) {
  const value = thread?.parentThreadId ?? thread?.parent_thread_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredUserId() {
  const userId = currentGatewayUserId();
  if (!userId) {
    throw new Error("Active main thread monitor requires an authenticated user scope");
  }
  return userId;
}

export const activeMainThreadMonitor = new ActiveMainThreadMonitor();
