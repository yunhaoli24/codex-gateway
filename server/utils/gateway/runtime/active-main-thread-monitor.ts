import pLimit from "p-limit";
import type { HostRecord } from "~~/shared/types";
import { threadIdFromNotification } from "../protocol/thread-payload";
import { currentGatewayUserId } from "../state/memory";
import type { CodexRpcClient } from "../infra/rpc";
import { runtimeLog } from "./runtime-log";

const RECOVERY_CONCURRENCY = 2;
const RECOVERY_TIMEOUT_MS = 15_000;
const UNSUBSCRIBE_TIMEOUT_MS = 5_000;

type ControllerLookup = (threadId: string) => boolean;

interface MonitorContext {
  host: HostRecord;
  client: CodexRpcClient;
  hasController: ControllerLookup;
}

/**
 * Attaches Gateway to main threads created by another app-server client, such as
 * VS Code. `thread/started` is broadcast by app-server to every connection, while
 * turn events are delivered only after this connection resumes that specific thread.
 *
 * Do not poll `thread/loaded/list` here. It exposes only ids, so the old monitor
 * followed every poll with `thread/read` for every loaded thread and then resumed
 * active ones. That work shared the only Host RPC connection with foreground UI
 * requests and could make a normal realtime request time out. Recovery scans once
 * after a Host connection is established, solely to cover a turn that was already
 * running while Gateway was disconnected.
 */
class ActiveMainThreadMonitor {
  private readonly observedByHost = new Map<string, Set<string>>();
  private readonly pendingByThread = new Map<string, Promise<void>>();
  private readonly pendingRecoveries = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();

  async recoverHost(context: MonitorContext) {
    const hostKey = this.hostKey(context.host.id);
    const pending = this.pendingRecoveries.get(hostKey);
    if (pending) return pending;

    const generation = this.generation(hostKey);
    const recovery = this.recoverLoadedThreads(context, hostKey, generation)
      .catch((error) => {
        // Observation is additive. A recovery failure must not make a connected
        // Host unavailable or surface as a browser realtime request failure.
        runtimeLog("active main thread recovery failed", {
          hostId: context.host.id,
          hostName: context.host.name,
          message: messageFromError(error),
        });
      })
      .finally(() => {
        if (this.pendingRecoveries.get(hostKey) === recovery) {
          this.pendingRecoveries.delete(hostKey);
        }
      });
    this.pendingRecoveries.set(hostKey, recovery);
    return recovery;
  }

  handleNotification(context: MonitorContext, message: unknown) {
    const method = (message as any)?.method;
    const threadId = threadIdFromNotification(message);
    if (!threadId) return;

    if (method === "thread/started") {
      if (isSubagentThread(message)) return;
      void this.observeThread(context, threadId).catch((error) => {
        runtimeLog("active main thread subscribe failed", {
          hostId: context.host.id,
          hostName: context.host.name,
          threadId,
          message: messageFromError(error),
        });
      });
      return;
    }

    if (method === "turn/completed") {
      void this.releaseThread(context, threadId);
    }
  }

  forgetHost(userId: number, hostId: number) {
    const key = this.hostKey(hostId, userId);
    this.generations.set(key, this.generation(key) + 1);
    this.observedByHost.delete(key);
    this.pendingRecoveries.delete(key);
    for (const key of this.pendingByThread.keys()) {
      if (key.startsWith(`${this.hostKey(hostId, userId)}:`)) {
        this.pendingByThread.delete(key);
      }
    }
  }

  private async recoverLoadedThreads(context: MonitorContext, hostKey: string, generation: number) {
    const threadIds = await loadedThreadIds(context.client);
    const limit = pLimit(RECOVERY_CONCURRENCY);
    await Promise.all(
      threadIds.map((threadId) =>
        limit(async () => {
          if (!this.isCurrent(hostKey, generation)) return;
          await this.observeThread(context, threadId, true);
        }),
      ),
    );
  }

  private async observeThread(
    context: MonitorContext,
    threadId: string,
    releaseIdleThread = false,
  ) {
    if (context.hasController(threadId)) return;
    const hostKey = this.hostKey(context.host.id);
    const observed = this.observedByHost.get(hostKey);
    if (observed?.has(threadId)) return;

    const key = `${hostKey}:${threadId}`;
    const pending = this.pendingByThread.get(key);
    if (pending) return pending;

    const generation = this.generation(hostKey);
    const subscription = this.resumeMonitorOnlyThread(
      context,
      threadId,
      releaseIdleThread,
      generation,
    ).finally(() => {
      if (this.pendingByThread.get(key) === subscription) {
        this.pendingByThread.delete(key);
      }
    });
    this.pendingByThread.set(key, subscription);
    return subscription;
  }

  private async resumeMonitorOnlyThread(
    context: MonitorContext,
    threadId: string,
    releaseIdleThread: boolean,
    generation: number,
  ) {
    const result = await context.client.request<any>(
      "thread/resume",
      { threadId, excludeTurns: true },
      RECOVERY_TIMEOUT_MS,
    );
    const thread = result?.thread ?? result;
    const hostKey = this.hostKey(context.host.id);
    if (!this.isCurrent(hostKey, generation) || context.hasController(threadId)) return;

    // A loaded list is not restricted to active main threads. Resume is the one
    // request that both tells us its metadata and attaches the event listener, so
    // immediately release idle/subagent results discovered during recovery.
    if (isSubagentThread({ params: { thread } }) || (releaseIdleThread && !isActive(thread))) {
      await this.unsubscribe(context, threadId);
      return;
    }

    let observed = this.observedByHost.get(hostKey);
    if (!observed) {
      observed = new Set();
      this.observedByHost.set(hostKey, observed);
    }
    observed.add(threadId);
    runtimeLog("subscribed to active main thread", {
      hostId: context.host.id,
      hostName: context.host.name,
      threadId,
    });
  }

  private async releaseThread(context: MonitorContext, threadId: string) {
    const hostKey = this.hostKey(context.host.id);
    const observed = this.observedByHost.get(hostKey);
    if (!observed?.delete(threadId)) return;
    if (!observed.size) this.observedByHost.delete(hostKey);
    if (!context.hasController(threadId)) {
      await this.unsubscribe(context, threadId);
    }
  }

  private async unsubscribe(context: MonitorContext, threadId: string) {
    await context.client
      .request("thread/unsubscribe", { threadId }, UNSUBSCRIBE_TIMEOUT_MS)
      .catch((error) => {
        runtimeLog("monitor-only thread unsubscribe failed", {
          hostId: context.host.id,
          hostName: context.host.name,
          threadId,
          message: messageFromError(error),
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

async function loadedThreadIds(client: CodexRpcClient) {
  const threadIds: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { data?: unknown; nextCursor?: unknown } = await client.request(
      "thread/loaded/list",
      { cursor, limit: 100 },
      RECOVERY_TIMEOUT_MS,
    );
    for (const threadId of Array.isArray(page.data) ? page.data : []) {
      if (typeof threadId === "string" && threadId.trim()) threadIds.push(threadId);
    }
    const nextCursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return threadIds;
}

function isActive(thread: any) {
  const status = typeof thread?.status === "string" ? thread.status : thread?.status?.type;
  return ["active", "inProgress", "in_progress", "running"].includes(status);
}

function isSubagentThread(message: unknown) {
  const thread = (message as any)?.params?.thread;
  const parentThreadId = thread?.parentThreadId ?? thread?.parent_thread_id;
  return typeof parentThreadId === "string" && parentThreadId.trim().length > 0;
}

function requiredUserId() {
  const userId = currentGatewayUserId();
  if (!userId) throw new Error("Active main thread monitor requires an authenticated user scope");
  return userId;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const activeMainThreadMonitor = new ActiveMainThreadMonitor();
