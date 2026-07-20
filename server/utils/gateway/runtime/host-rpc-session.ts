import type { HostRecord } from "~~/shared/types";
import { buildCurrentTimeReadResponse, isCurrentTimeReadRequest } from "~~/shared/server-requests";
import { CodexRpcClient } from "../infra/rpc";
import { bindGatewayUser } from "../state/memory";
import type { HostControllerLookup, HostControllersLookup } from "./types";
import { threadIdFromNotification } from "../protocol/thread-payload";
import { threadRuntimeEvents } from "./thread-runtime-events";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";

export class HostRpcSession {
  readonly client: CodexRpcClient;
  private connected = false;
  private connectPromise: Promise<CodexRpcClient> | null = null;

  constructor(
    readonly host: HostRecord,
    private readonly controllerForThread: HostControllerLookup,
    private readonly controllersForHost: HostControllersLookup,
    private readonly onClose?: () => void,
  ) {
    this.client = new CodexRpcClient(host);
    this.client.on(
      "notification",
      bindGatewayUser((message: any) => this.routeNotification(message)),
    );
    this.client.on(
      "request",
      bindGatewayUser((message: any) => this.routeRequest(message)),
    );
    this.client.on(
      "stderr",
      bindGatewayUser((text) => this.routeStderr(text)),
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
    if (!this.connectPromise) {
      this.connectPromise = this.client
        .connect()
        .then(() => {
          this.connected = true;
          return this.client;
        })
        .finally(() => {
          this.connectPromise = null;
        });
    }
    return this.connectPromise;
  }

  private routeNotification(message: any) {
    activeMainThreadMonitor.handleNotification(
      {
        host: this.host,
        client: this.client,
        hasController: (threadId) => Boolean(this.controllerForThread(this.host.id, threadId)),
      },
      message,
    );
    const threadId = threadIdFromNotification(message);
    if (!threadId) {
      return;
    }
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller) {
      controller.handleNotification(message);
    } else {
      threadRuntimeEvents.record(
        this.host.id,
        threadId,
        message.method || "notification",
        message,
        {
          resolveGoal: () => this.client.request("thread/goal/get", { threadId }),
          resolveThread: () =>
            this.client.request("thread/read", { threadId, includeTurns: false }),
        },
      );
    }
  }

  private routeRequest(message: any) {
    if (isCurrentTimeReadRequest(message)) {
      this.client.respond(message.id!, buildCurrentTimeReadResponse());
      return;
    }

    const threadId = threadIdFromNotification(message);
    if (!threadId) {
      threadRuntimeEvents.record(this.host.id, "gateway", message.method || "request", message);
      return;
    }
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller) {
      controller.handleNotification(message);
    } else {
      threadRuntimeEvents.record(this.host.id, threadId, message.method || "request", message, {
        resolveGoal: () => this.client.request("thread/goal/get", { threadId }),
        resolveThread: () => this.client.request("thread/read", { threadId, includeTurns: false }),
      });
    }
  }

  private routeStderr(text: string) {
    for (const controller of this.controllersForHost(this.host.id)) {
      controller.handleStderr(text);
    }
  }

  close() {
    this.connected = false;
    this.client.close();
  }
}
