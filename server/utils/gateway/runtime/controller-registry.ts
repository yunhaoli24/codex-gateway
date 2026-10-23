import type { AgentProviderId, HostRecord } from "~~/shared/types";
import { currentGatewayUserId, runWithGatewayUser } from "../state/memory";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { HostRpcSession } from "./host-rpc-session";
import { hostSessionEvents } from "./host-session-events";
import { ThreadController } from "./thread-controller";
import { runtimeLog } from "./runtime-log";
import { providerAdapterFor } from "../agent/provider-registry";
import {
  hostRuntimeKey,
  hostRuntimePrefix,
  threadRuntimeKey,
  threadRuntimePrefix,
  type HostRuntimeKey,
  type ThreadRuntimeKey,
} from "./runtime-identity";

export type SubscriptionLeaseOwner = "bootstrap" | "browser" | "scoped";

export interface ThreadSubscriptionLease {
  ready: Promise<ThreadController>;
  release: () => void;
}

interface RetainSubscriptionOptions {
  providerId?: AgentProviderId;
  upstreamAlreadySubscribed?: boolean;
  deferUpstreamSubscription?: boolean;
  forceUpstreamSubscription?: boolean;
}

interface SubscriptionLeases {
  bootstrap: number;
  browser: number;
  scoped: number;
}

export class ControllerRegistry {
  private readonly controllers = new Map<ThreadRuntimeKey, ThreadController>();
  private readonly pendingControllers = new Map<ThreadRuntimeKey, Promise<ThreadController>>();
  private readonly controllerGenerations = new Map<ThreadRuntimeKey, number>();
  private readonly hostSessions = new Map<HostRuntimeKey, HostRpcSession>();
  private readonly subscriptionLeases = new Map<ThreadRuntimeKey, SubscriptionLeases>();
  private readonly bootstrapSubscriptions = new Map<ThreadRuntimeKey, ThreadSubscriptionLease>();

  private async getController(
    host: HostRecord,
    threadId: string,
    providerId: AgentProviderId = "codex",
  ) {
    const userId = this.userKey();
    const key = this.key(userId, host.id, providerId, threadId);
    let controller = this.controllers.get(key);
    if (!controller) {
      let pending = this.pendingControllers.get(key);
      if (!pending) {
        const generation = this.controllerGeneration(key);
        pending = this.createController(
          userId,
          host,
          threadId,
          providerId,
          key,
          generation,
        ).finally(() => {
          if (this.pendingControllers.get(key) === pending) {
            this.pendingControllers.delete(key);
          }
          this.deleteUnusedControllerGeneration(key);
        });
        this.pendingControllers.set(key, pending);
      }
      controller = await pending;
    }
    await controller.ensureConnected();
    return controller;
  }

  async getHostClient(host: HostRecord, providerId: AgentProviderId = "codex") {
    return this.getHostClientForUser(this.userKey(), host, this.getHostProvider(host, providerId));
  }

  retainSubscription(
    host: HostRecord,
    threadId: string,
    owner: SubscriptionLeaseOwner,
    options: RetainSubscriptionOptions = {},
  ): ThreadSubscriptionLease {
    const userId = this.userKey();
    const providerId = options.providerId ?? "codex";
    const key = this.key(userId, host.id, providerId, threadId);
    const leases = this.subscriptionLeases.get(key) ?? { bootstrap: 0, browser: 0, scoped: 0 };
    leases[owner] += 1;
    this.subscriptionLeases.set(key, leases);
    this.logLeaseChange("retain", userId, host, providerId, threadId, owner);
    const ready = this.getController(host, threadId, providerId).then(async (controller) => {
      if (options.upstreamAlreadySubscribed === true) {
        // `thread/start` subscribes the same shared Host RPC connection before a controller exists.
        // Adopt that protocol-owned subscription instead of issuing a redundant thread/resume.
        controller.adoptExistingSubscription();
      } else if (options.deferUpstreamSubscription !== true) {
        await controller.ensureSubscribed(options.forceUpstreamSubscription === true);
      }
      return controller;
    });
    let released = false;
    return {
      ready,
      release: () => {
        if (released) return;
        released = true;
        const current = this.subscriptionLeases.get(key) ?? {
          bootstrap: 0,
          browser: 0,
          scoped: 0,
        };
        current[owner] = Math.max(0, current[owner] - 1);
        if (current.bootstrap + current.browser + current.scoped > 0) {
          this.subscriptionLeases.set(key, current);
          return;
        }
        this.subscriptionLeases.delete(key);
        this.logLeaseChange("release", userId, host, providerId, threadId, owner);
        // Replacing a peer subscription releases the old callback before retaining the new one.
        // Deferring zero-count disposal by one microtask coalesces that handoff without keeping
        // abandoned controllers alive indefinitely. The microtask no longer inherits a request or
        // WebSocket callback reliably, so restore the lease owner's user scope explicitly before
        // transferring an active subscription to the background monitor.
        const dispose = async (controller: ThreadController) => {
          await controller.whenIdle();
          queueMicrotask(() => {
            runWithGatewayUser(userId, () => {
              if (this.controllers.get(key) === controller && !this.hasLeases(key))
                this.releaseUnleasedController(userId, key);
            });
          });
        };
        // A pending resume can still create an upstream subscription. Let its ready operation
        // settle before the zero-owner cleanup, so cancellation cannot leave a late orphan.
        void ready.then(dispose, () => {
          // Readiness can reject after a controller was installed (for example resume timeout).
          // That controller still needs the same zero-owner cleanup as a successful activation.
          const controller = this.controllers.get(key);
          if (controller !== undefined) return dispose(controller);
        });
      },
    };
  }

  retainActivationController(host: HostRecord, threadId: string) {
    // Reserve the browser lease before history activation. ThreadOpenService decides whether a
    // remote resume and timeline read are needed, so cache hits do not resume idle threads merely
    // to render history.
    return this.retainSubscription(host, threadId, "browser", {
      deferUpstreamSubscription: true,
    });
  }

  async retainStartedThreadSubscription(
    host: HostRecord,
    threadId: string,
    providerId: AgentProviderId = "codex",
  ) {
    const userId = this.userKey();
    const key = this.key(userId, host.id, providerId, threadId);
    const existing = this.bootstrapSubscriptions.get(key);
    if (existing !== undefined) return existing.ready;

    // thread/start auto-subscribes the requesting app-server connection, but the fresh identity
    // has no rollout yet and therefore cannot be recovered with thread/resume. Keep that protocol
    // subscription independently of whichever browser view is selected. The first turn/started
    // notification materializes the rollout and releases this bootstrap owner after normal browser
    // or scoped owners have observed the same event.
    const lease = this.retainSubscription(host, threadId, "bootstrap", {
      providerId,
      upstreamAlreadySubscribed: true,
    });
    this.bootstrapSubscriptions.set(key, lease);
    try {
      return await lease.ready;
    } catch (error) {
      if (this.bootstrapSubscriptions.get(key) === lease) {
        this.bootstrapSubscriptions.delete(key);
        lease.release();
      }
      throw error;
    }
  }

  async withScopedSubscription<T>(
    host: HostRecord,
    threadId: string,
    operation: (controller: ThreadController) => Promise<T>,
  ) {
    const lease = this.retainSubscription(host, threadId, "scoped");
    try {
      const controller = await lease.ready;
      return await operation(controller);
    } finally {
      lease.release();
    }
  }

  controllersForHost(hostId: number) {
    return this.controllersForUserHost(this.userKey(), hostId);
  }

  hasController(hostId: number, threadId: string, providerId: AgentProviderId = "codex") {
    return this.controllers.has(this.key(this.userKey(), hostId, providerId, threadId));
  }

  close(hostId: number, threadId: string, providerId: AgentProviderId = "codex") {
    const key = this.key(this.userKey(), hostId, providerId, threadId);
    this.releaseBootstrapSubscription(key);
    this.subscriptionLeases.delete(key);
    this.closeByKey(key);
  }

  closeHost(hostId: number) {
    const userId = this.userKey();
    this.releaseBootstrapSubscriptionsForHost(userId, hostId);
    this.deleteSubscriptionLeasesForHost(userId, hostId);
    for (const controller of this.controllersForUserHost(userId, hostId)) {
      const key = this.key(userId, hostId, controller.provider.id, controller.threadId);
      this.subscriptionLeases.delete(key);
      this.invalidateController(key);
      controller.close();
      this.controllers.delete(key);
    }
    this.deletePendingForHost(userId, hostId);
    const prefix = hostRuntimePrefix(userId, hostId);
    for (const [key, session] of this.hostSessions) {
      if (!key.startsWith(prefix)) continue;
      this.hostSessions.delete(key);
      session.close();
    }
  }

  disconnectHostTransport(hostId: number) {
    const userId = this.userKey();
    const prefix = hostRuntimePrefix(userId, hostId);
    for (const [key, session] of this.hostSessions) {
      if (!key.startsWith(prefix)) continue;
      // A daemon restart is a transport replacement, not Host deletion. Use the normal close
      // projection to retain browser/scoped leases so already-open pages resume receiving events.
      // Explicit client.close() does not emit the remote-close event, so dispose here exactly once.
      this.disposeHostSession(userId, hostId, session.provider.id, session);
      session.close();
    }
  }

  status() {
    const userId = this.userKey();
    return this.controllersForUser(userId).map((controller) => ({
      hostId: controller.host.id,
      threadId: controller.threadId,
      leases: this.subscriptionLeases.get(
        this.key(userId, controller.host.id, controller.provider.id, controller.threadId),
      ) ?? { bootstrap: 0, browser: 0, scoped: 0 },
      monitorOwned: activeMainThreadMonitor.hasObservedThread(
        controller.host.id,
        controller.threadId,
        controller.provider.id,
      ),
    }));
  }

  async restoreRetainedSubscriptions(host: HostRecord, providerId: AgentProviderId = "codex") {
    const userId = this.userKey();
    const prefix = threadRuntimePrefix(userId, host.id, providerId);
    const threadIds = [...this.subscriptionLeases.entries()]
      .filter(([key, leases]) => key.startsWith(prefix) && leases.browser + leases.scoped > 0)
      .map(([key]) => key.slice(prefix.length));
    await Promise.all(
      threadIds.map(async (threadId) => {
        const key = this.key(userId, host.id, providerId, threadId);
        if (!this.hasLeases(key)) return;
        const controller = await this.getController(host, threadId, providerId);
        if (!this.hasLeases(key)) {
          this.releaseUnleasedController(userId, key);
          return;
        }
        await controller.ensureSubscribed();
      }),
    );
  }

  private async createController(
    userId: number,
    host: HostRecord,
    threadId: string,
    providerId: AgentProviderId,
    key: ThreadRuntimeKey,
    generation: number,
  ) {
    const provider = this.getHostProvider(host, providerId);
    const client = await this.getHostClientForUser(userId, host, provider);
    if (this.controllerGeneration(key) !== generation) {
      throw new Error("Thread controller creation was superseded");
    }
    const inheritedSubscription = activeMainThreadMonitor.reclaimSubscribedThread(
      host.id,
      threadId,
      provider.id,
    );
    const controller = new ThreadController(
      host,
      threadId,
      client,
      provider,
      true,
      inheritedSubscription,
      false,
      () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key);
          this.deleteUnusedControllerGeneration(key);
        }
      },
      () => this.releaseBootstrapSubscription(key),
    );
    this.controllers.set(key, controller);
    runtimeLog("thread controller created", {
      userId,
      hostId: host.id,
      hostName: host.name,
      threadId,
      inheritedMonitorSubscription: inheritedSubscription,
      leases: this.subscriptionLeases.get(key) ?? { bootstrap: 0, browser: 0, scoped: 0 },
    });
    return controller;
  }

  private async getHostClientForUser(
    userId: number,
    host: HostRecord,
    provider = this.getHostProvider(host),
  ) {
    const key = this.hostKey(userId, host.id, provider.id);
    let session = this.hostSessions.get(key);
    if (!session) {
      session = new HostRpcSession(
        host,
        (hostId, threadId) =>
          this.controllers.get(this.key(userId, hostId, provider.id, threadId)) ?? null,
        (hostId) => this.controllersForUserHost(userId, hostId, provider.id),
        provider,
        () => this.disposeHostSession(userId, host.id, provider.id, session),
      );
      this.hostSessions.set(key, session);
    }
    return session.connect();
  }

  private getHostProvider(_host: HostRecord, providerId: AgentProviderId = "codex") {
    // Host storage is intentionally provider-neutral for now. The binding is
    // explicit at the session boundary so adding a provider later changes this
    // registry, not every runtime event consumer.
    return providerAdapterFor(providerId);
  }

  private controllersForUserHost(userId: number, hostId: number, providerId?: AgentProviderId) {
    return Array.from(this.controllers.values()).filter(
      (controller) =>
        controller.host.id === hostId &&
        (providerId === undefined || controller.provider.id === providerId) &&
        this.controllers.get(
          this.key(userId, hostId, controller.provider.id, controller.threadId),
        ) === controller,
    );
  }

  private controllersForUser(userId: number) {
    const prefix = `${userId}:`;
    return Array.from(this.controllers.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, controller]) => controller);
  }

  private disposeHostSession(
    userId: number,
    hostId: number,
    providerId: AgentProviderId,
    session: HostRpcSession | undefined,
  ) {
    const hostKey = this.hostKey(userId, hostId, providerId);
    if (session && this.hostSessions.get(hostKey) === session) {
      this.hostSessions.delete(hostKey);
    }
    // A bootstrap subscription belongs to the app-server connection created by thread/start. Once
    // that transport closes there is no protocol operation that can reattach an unmaterialized
    // thread: thread/resume requires a rollout. Drop the dead owner instead of making every Host
    // reconnect fail while trying to restore something the upstream protocol cannot restore.
    this.releaseBootstrapSubscriptionsForHost(userId, hostId, providerId);
    for (const controller of this.controllersForUserHost(userId, hostId, providerId)) {
      const key = this.key(userId, hostId, providerId, controller.threadId);
      this.invalidateController(key);
      controller.disposeAfterTransportClose();
      this.controllers.delete(key);
    }
    this.deletePendingForHost(userId, hostId, providerId);
    hostSessionEvents.emitClosed(userId, hostId);
  }

  private deletePendingForHost(userId: number, hostId: number, providerId?: AgentProviderId) {
    const prefix =
      providerId === undefined
        ? hostRuntimePrefix(userId, hostId)
        : threadRuntimePrefix(userId, hostId, providerId);
    for (const key of this.pendingControllers.keys()) {
      if (key.startsWith(prefix)) {
        this.invalidateController(key);
        this.pendingControllers.delete(key);
      }
    }
  }

  private deleteSubscriptionLeasesForHost(userId: number, hostId: number) {
    const prefix = `${userId}:${hostId}:`;
    for (const key of this.subscriptionLeases.keys()) {
      if (key.startsWith(prefix)) this.subscriptionLeases.delete(key);
    }
  }

  private closeByKey(key: ThreadRuntimeKey) {
    this.invalidateController(key);
    this.pendingControllers.delete(key);
    this.controllers.get(key)?.close();
    this.controllers.delete(key);
    this.deleteUnusedControllerGeneration(key);
  }

  private releaseUnleasedController(userId: number, key: ThreadRuntimeKey) {
    const controller = this.controllers.get(key);
    if (controller?.shouldTransferSubscriptionToMonitor() !== true) {
      if (controller !== undefined) {
        runtimeLog("thread controller closed without active monitor handoff", {
          userId,
          hostId: controller.host.id,
          hostName: controller.host.name,
          threadId: controller.threadId,
        });
      }
      this.closeByKey(key);
      return;
    }

    activeMainThreadMonitor.adoptSubscribedThread(
      {
        host: controller.host,
        client: controller.client,
        providerId: controller.provider.id,
        hasController: (threadId) =>
          this.controllers.has(
            this.key(userId, controller.host.id, controller.provider.id, threadId),
          ),
      },
      controller.threadId,
    );
    runtimeLog("thread controller handed to active monitor", {
      userId,
      hostId: controller.host.id,
      hostName: controller.host.name,
      threadId: controller.threadId,
    });
    this.invalidateController(key);
    this.pendingControllers.delete(key);
    controller.disposeKeepingUpstreamSubscription();
    this.controllers.delete(key);
    this.deleteUnusedControllerGeneration(key);
  }

  private hasLeases(key: ThreadRuntimeKey) {
    const leases = this.subscriptionLeases.get(key);
    return leases !== undefined && leases.bootstrap + leases.browser + leases.scoped > 0;
  }

  private releaseBootstrapSubscription(key: ThreadRuntimeKey) {
    const lease = this.bootstrapSubscriptions.get(key);
    if (lease === undefined) return;
    this.bootstrapSubscriptions.delete(key);
    lease.release();
  }

  private releaseBootstrapSubscriptionsForHost(
    userId: number,
    hostId: number,
    providerId?: AgentProviderId,
  ) {
    const prefix =
      providerId === undefined
        ? hostRuntimePrefix(userId, hostId)
        : threadRuntimePrefix(userId, hostId, providerId);
    for (const key of this.bootstrapSubscriptions.keys()) {
      if (key.startsWith(prefix)) this.releaseBootstrapSubscription(key);
    }
  }

  private logLeaseChange(
    action: "retain" | "release",
    userId: number,
    host: HostRecord,
    providerId: AgentProviderId,
    threadId: string,
    owner: SubscriptionLeaseOwner,
  ) {
    const leases = this.subscriptionLeases.get(this.key(userId, host.id, providerId, threadId)) ?? {
      bootstrap: 0,
      browser: 0,
      scoped: 0,
    };
    runtimeLog(`thread subscription ${action}`, {
      userId,
      hostId: host.id,
      hostName: host.name,
      threadId,
      owner,
      bootstrapLeases: leases.bootstrap,
      browserLeases: leases.browser,
      scopedLeases: leases.scoped,
      controllerCount: this.controllersForUserHost(userId, host.id, providerId).length,
      monitorOwnedCount: activeMainThreadMonitor.observedCount(host.id, userId, providerId),
    });
  }

  private controllerGeneration(key: ThreadRuntimeKey) {
    return this.controllerGenerations.get(key) ?? 0;
  }

  private invalidateController(key: ThreadRuntimeKey) {
    this.controllerGenerations.set(key, this.controllerGeneration(key) + 1);
  }

  private deleteUnusedControllerGeneration(key: ThreadRuntimeKey) {
    if (!this.controllers.has(key) && !this.pendingControllers.has(key)) {
      this.controllerGenerations.delete(key);
    }
  }

  private key(userId: number, hostId: number, providerId: AgentProviderId, threadId: string) {
    return threadRuntimeKey(userId, hostId, providerId, threadId);
  }

  private hostKey(userId: number, hostId: number, providerId: AgentProviderId) {
    return hostRuntimeKey(userId, hostId, providerId);
  }

  private userKey() {
    const userId = currentGatewayUserId();
    if (userId === null) {
      throw new Error("Gateway runtime requires an authenticated user scope");
    }
    return userId;
  }
}
