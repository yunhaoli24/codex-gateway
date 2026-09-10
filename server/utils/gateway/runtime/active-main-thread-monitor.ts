import pLimit from "p-limit";
import type { AppServerThread, HostRecord } from "~~/shared/types";
import {
  appServerThreadFromUnknown,
  isAppServerSubAgentThread,
  parseLoadedThreadsPage,
  parseThreadListPage,
  type AppServerThreadListPage,
  type LoadedThreadsPage,
} from "~~/shared/runtime/app-server";
import { recordFromUnknown } from "~~/shared/utils/records";
import { threadIdFromNotification } from "../protocol/thread-payload";
import { currentGatewayUserId } from "../state/memory";
import type { AgentRpcClient } from "../agent/provider-adapter";
import { runtimeLog } from "./runtime-log";
import { runtimeStatusFromAppThreadStatus } from "~~/shared/thread-runtime-status";
import { threadMetadataStore } from "../state/thread-metadata";

const RECOVERY_CONCURRENCY = 2;
const RECOVERY_TIMEOUT_MS = 15_000;
const UNSUBSCRIBE_TIMEOUT_MS = 5_000;

type ControllerLookup = (threadId: string) => boolean;

interface MonitorContext {
  host: HostRecord;
  client: AgentRpcClient;
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
    const method = recordFromUnknown(message)?.method;
    const threadId = threadIdFromNotification(message);
    if (threadId === null) return;

    if (method === "thread/started") {
      const thread = startedThread(message);
      if (thread !== null) threadMetadataStore.record(context.host.id, null, thread);
      // `thread/started` also announces newly-created idle threads. Resuming every announcement
      // would materialize conversations that no Gateway browser is using. Status broadcasts cover
      // later turns, so only an already-active main thread is eligible for monitor ownership here.
      if (thread === null || isAppServerSubAgentThread(thread) || !isActive(thread)) return;
      this.scheduleObservation(context, threadId, "active main thread subscribe failed");
      return;
    }

    if (method === "thread/status/changed") {
      const params = recordFromUnknown(recordFromUnknown(message)?.params);
      if (runtimeStatusFromAppThreadStatus(params?.status) === "running") {
        // Existing idle threads do not emit thread/started for every new turn. The global status
        // broadcast is therefore the ownership signal for work started by VS Code and other
        // app-server clients; resume validates main-vs-subagent before retaining the subscription.
        this.scheduleObservation(context, threadId, "active main thread status subscribe failed");
      } else {
        void this.releaseThread(context, threadId);
      }
      return;
    }

    // Do not release on turn/completed. App-server finalizes persistence before broadcasting the
    // subsequent non-active thread/status/changed event; unsubscribing in between can miss the
    // remaining persistence/Goal notifications. The status event is the ownership edge.
  }

  adoptSubscribedThread(context: MonitorContext, threadId: string) {
    const hostKey = this.hostKey(context.host.id);
    let observed = this.observedByHost.get(hostKey);
    if (observed === undefined) {
      observed = new Set();
      this.observedByHost.set(hostKey, observed);
    }
    if (observed.has(threadId)) return;
    // ControllerRegistry calls this synchronously before removing the final browser-owned
    // controller. The app-server subscription is already live, so resuming here would duplicate
    // work on the Host's single RPC channel; recording ownership is the complete handoff.
    observed.add(threadId);
    runtimeLog("adopted active main thread subscription", {
      hostId: context.host.id,
      hostName: context.host.name,
      threadId,
    });
  }

  observeKnownActiveThread(context: MonitorContext, threadId: string) {
    return this.observeThread(context, threadId);
  }

  hasObservedThread(hostId: number, threadId: string) {
    return this.observedByHost.get(this.hostKey(hostId))?.has(threadId) === true;
  }

  observedCount(hostId: number, userId = requiredUserId()) {
    return this.observedByHost.get(this.hostKey(hostId, userId))?.size ?? 0;
  }

  reclaimSubscribedThread(hostId: number, threadId: string) {
    const hostKey = this.hostKey(hostId);
    const observed = this.observedByHost.get(hostKey);
    if (observed?.delete(threadId) !== true) return false;
    if (observed.size === 0) this.observedByHost.delete(hostKey);
    // The new controller inherits the already-live subscription. Do not unsubscribe or resume:
    // both operations create an avoidable delivery gap/duplicate on the shared Host RPC channel.
    return true;
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
    const threads = await activeLoadedMainThreads(context.client);
    const limit = pLimit(RECOVERY_CONCURRENCY);
    await Promise.all(
      threads.map((thread) =>
        limit(async () => {
          if (!this.isCurrent(hostKey, generation)) return;
          await this.observeThread(context, thread.id);
        }),
      ),
    );
  }

  private async observeThread(context: MonitorContext, threadId: string) {
    if (context.hasController(threadId)) return;
    const hostKey = this.hostKey(context.host.id);
    const observed = this.observedByHost.get(hostKey);
    if (observed?.has(threadId) === true) return;

    const key = `${hostKey}:${threadId}`;
    const pending = this.pendingByThread.get(key);
    if (pending !== undefined) return pending;

    const generation = this.generation(hostKey);
    const subscription = this.resumeMonitorOnlyThread(context, threadId, generation).finally(() => {
      if (this.pendingByThread.get(key) === subscription) {
        this.pendingByThread.delete(key);
      }
    });
    this.pendingByThread.set(key, subscription);
    return subscription;
  }

  private scheduleObservation(context: MonitorContext, threadId: string, failureMessage: string) {
    // The Host session first routes a global notification to this monitor and then records it in
    // threadRuntimeEvents for browser peers. Deferring one microtask lets a browser's event
    // listener acquire its explicit lease first; otherwise both paths can issue thread/resume for
    // the same active thread on the shared RPC connection.
    queueMicrotask(() => {
      void this.observeThread(context, threadId).catch((error) => {
        runtimeLog(failureMessage, {
          hostId: context.host.id,
          hostName: context.host.name,
          threadId,
          message: messageFromError(error),
        });
      });
    });
  }

  private async resumeMonitorOnlyThread(
    context: MonitorContext,
    threadId: string,
    generation: number,
  ) {
    const result = await context.client.request(
      "thread/resume",
      { threadId, excludeTurns: true },
      RECOVERY_TIMEOUT_MS,
    );
    const resultRecord = recordFromUnknown(result);
    const thread = appServerThreadFromUnknown(resultRecord?.thread ?? result);
    const hostKey = this.hostKey(context.host.id);
    if (!this.isCurrent(hostKey, generation) || context.hasController(threadId)) return;

    if (thread === null || isAppServerSubAgentThread(thread) || !isActive(thread)) {
      await this.unsubscribe(context, threadId);
      return;
    }

    this.adoptSubscribedThread(context, threadId);
    runtimeLog("subscribed to active main thread", {
      hostId: context.host.id,
      hostName: context.host.name,
      threadId,
    });
  }

  private async releaseThread(context: MonitorContext, threadId: string) {
    const hostKey = this.hostKey(context.host.id);
    const observed = this.observedByHost.get(hostKey);
    if (observed?.delete(threadId) !== true) return;
    if (observed.size === 0) this.observedByHost.delete(hostKey);
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

async function loadedThreadIds(client: AgentRpcClient) {
  const threadIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: LoadedThreadsPage = await client.request(
      "thread/loaded/list",
      { cursor, limit: 100 },
      RECOVERY_TIMEOUT_MS,
      parseLoadedThreadsPage,
    );
    for (const threadId of page.data) {
      if (threadId.trim() !== "") threadIds.add(threadId);
    }
    const nextCursor: string | null = page.nextCursor ?? null;
    if (nextCursor === null || nextCursor === "" || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor !== null);
  return threadIds;
}

async function activeLoadedMainThreads(client: AgentRpcClient) {
  const loadedIds = await loadedThreadIds(client);
  if (loadedIds.size === 0) return [];

  const activeThreads: AppServerThread[] = [];
  const unresolvedIds = new Set(loadedIds);
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    // `thread/loaded/list` exposes ids only. Resuming every id merely to inspect metadata
    // attaches Gateway to an unbounded history and competes with foreground work on the
    // Host's single RPC connection. The state-DB list is the official metadata path; only
    // active main-thread candidates are resumed below.
    const page: AppServerThreadListPage = await client.request(
      "thread/list",
      {
        cursor,
        limit: 100,
        sortDirection: "desc",
        useStateDbOnly: true,
        sourceKinds: ["cli", "vscode", "exec", "appServer"],
      },
      RECOVERY_TIMEOUT_MS,
      parseThreadListPage,
    );
    for (const thread of page.data) {
      if (!unresolvedIds.delete(thread.id)) continue;
      if (isActive(thread) && !isAppServerSubAgentThread(thread)) activeThreads.push(thread);
    }
    const nextCursor: string | null = page.nextCursor;
    if (
      unresolvedIds.size === 0 ||
      nextCursor === null ||
      nextCursor === "" ||
      seenCursors.has(nextCursor)
    ) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor !== null);
  return activeThreads;
}

function isActive(thread: AppServerThread) {
  const statusRecord = recordFromUnknown(thread.status);
  const status = typeof thread.status === "string" ? thread.status : statusRecord?.type;
  return (
    typeof status === "string" &&
    ["active", "inProgress", "in_progress", "running"].includes(status)
  );
}

function startedThread(message: unknown) {
  const params = recordFromUnknown(recordFromUnknown(message)?.params);
  return appServerThreadFromUnknown(params?.thread);
}

function requiredUserId() {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Active main thread monitor requires an authenticated user scope");
  }
  return userId;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const activeMainThreadMonitor = new ActiveMainThreadMonitor();
