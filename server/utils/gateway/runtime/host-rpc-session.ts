import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { bindGatewayUser } from "../state/memory";
import type { HostControllerLookup, HostControllersLookup } from "./types";
import { threadIdFromNotification } from "../protocol/thread-payload";
import { threadRuntimeEvents } from "./thread-runtime-events";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { createThreadNotificationResolvers } from "./notification-rpc-resolvers";
import { pendingServerRequests } from "./pending-server-requests";
import { mcpEventSubscriptions } from "./mcp-event-subscriptions";
import { stringFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import type { AgentRpcClient, ProviderAdapter } from "../agent/provider-adapter";

export class HostRpcSession {
  readonly client: AgentRpcClient;
  readonly provider: ProviderAdapter;
  private connected = false;
  private connectPromise: Promise<AgentRpcClient> | null = null;
  private generation = 0;

  constructor(
    readonly host: HostRecord,
    private readonly controllerForThread: HostControllerLookup,
    private readonly controllersForHost: HostControllersLookup,
    provider: ProviderAdapter,
    private readonly onClose?: () => void,
  ) {
    this.provider = provider;
    this.client = provider.createClient(host);
    this.client.on(
      "notification",
      bindGatewayUser((message: RpcEnvelope) => this.routeNotification(message)),
    );
    this.client.on(
      "request",
      bindGatewayUser((message: RpcEnvelope) => this.routeRequest(message)),
    );
    this.client.on(
      "stderr",
      bindGatewayUser((text: string) => this.routeStderr(text)),
    );
    this.client.on(
      "close",
      bindGatewayUser(() => {
        this.connected = false;
        this.onClose?.();
      }),
    );
  }

  async connect() {
    if (this.connected) {
      return this.client;
    }
    if (this.connectPromise === null) {
      const generation = this.generation;
      const pending = this.client
        .connect()
        .then(() => {
          if (generation !== this.generation) {
            throw new Error("Host RPC session connection was superseded");
          }
          this.connected = true;
          return this.client;
        })
        .finally(() => {
          if (this.connectPromise === pending) this.connectPromise = null;
        });
      this.connectPromise = pending;
    }
    return this.connectPromise;
  }

  private routeNotification(message: RpcEnvelope) {
    activeMainThreadMonitor.handleNotification(
      {
        host: this.host,
        client: this.client,
        hasController: (threadId) => this.controllerForThread(this.host.id, threadId) !== null,
      },
      message,
    );
    this.provider.handleNotification(this.client, this.host, message);
    const threadId = threadIdFromNotification(message) ?? this.mcpEventStreamThreadId(message);
    if (threadId === null) {
      return;
    }
    pendingServerRequests.resolveFromNotification(this.host.id, threadId, message);
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller !== null) {
      controller.handleNotification(message);
    } else {
      this.recordUnownedNotification(threadId, message, "notification");
    }
  }

  private routeRequest(message: RpcEnvelope) {
    if (this.provider.handleServerRequest(this.client, message)) return;

    const threadId = threadIdFromNotification(message);
    if (threadId === null) {
      // Provider-level requests with no thread routing land on the gateway
      // scope; no thread notification resolvers apply there.
      this.recordUnownedNotification("gateway", message, "request", false);
      return;
    }
    pendingServerRequests.track(this.host.id, threadId, message);
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller !== null) {
      controller.handleNotification(message);
    } else {
      this.recordUnownedNotification(threadId, message, "request");
    }
  }

  /**
   * Notifications arriving for a thread with no live controller still flow
   * through the provider adapter into the canonical event bus (snapshot
   * caching, catch-up feeds, notifications).
   */
  private recordUnownedNotification(
    threadId: string,
    message: RpcEnvelope,
    fallbackMethod: string,
    withThreadResolvers = true,
  ) {
    threadRuntimeEvents.recordNotification(
      this.host.id,
      threadId,
      {
        method: message.method ?? fallbackMethod,
        params: message.params,
        id: message.id ?? undefined,
        emittedAtMs: "emittedAtMs" in message ? message.emittedAtMs : undefined,
      },
      this.provider,
      withThreadResolvers ? createThreadNotificationResolvers(this.client, threadId) : {},
    );
  }

  private routeStderr(text: string) {
    for (const controller of this.controllersForHost(this.host.id)) {
      controller.handleStderr(text);
    }
  }

  private mcpEventStreamThreadId(message: RpcEnvelope) {
    if (message.method !== "mcpServer/event/stream/notification") return null;
    const subscriptionId = stringFromUnknown(recordFromUnknown(message.params)?.subscriptionId);
    return subscriptionId === null
      ? null
      : mcpEventSubscriptions.threadId(this.host.id, subscriptionId);
  }

  close() {
    this.generation += 1;
    this.connected = false;
    this.connectPromise = null;
    this.client.close();
    mcpEventSubscriptions.clearHost(this.host.id);
  }
}
