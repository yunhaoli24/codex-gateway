import type { HostRecord } from "~~/shared/types";
import { buildCurrentTimeReadResponse, isCurrentTimeReadRequest } from "~~/shared/server-requests";
import { CodexRpcClient } from "../infra/rpc";
import { gatewayEventStore } from "../state/gateway-events";
import type { HostControllerLookup, HostControllersLookup } from "./types";
import { threadIdFromNotification } from "../protocol/thread-payload";

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
    this.client.on("notification", (message: any) => this.routeNotification(message));
    this.client.on("request", (message: any) => this.routeRequest(message));
    this.client.on("stderr", (text) => this.routeStderr(text));
    this.client.on("close", () => {
      this.connected = false;
      this.onClose?.();
    });
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
    const threadId = threadIdFromNotification(message);
    if (!threadId) {
      return;
    }
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller) {
      controller.handleNotification(message);
    } else {
      gatewayEventStore.add(this.host.id, threadId, message.method || "notification", message);
    }
  }

  private routeRequest(message: any) {
    if (isCurrentTimeReadRequest(message)) {
      this.client.respond(message.id!, buildCurrentTimeReadResponse());
      return;
    }

    const threadId = threadIdFromNotification(message);
    if (!threadId) {
      gatewayEventStore.add(this.host.id, "gateway", message.method || "request", message);
      return;
    }
    const controller = this.controllerForThread(this.host.id, threadId);
    if (controller) {
      controller.handleNotification(message);
    } else {
      gatewayEventStore.add(this.host.id, threadId, message.method || "request", message);
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
