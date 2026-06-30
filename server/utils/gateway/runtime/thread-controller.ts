import type { GatewayEvent, HostRecord } from "~~/shared/types";
import { CodexRpcClient } from "../infra/rpc";
import { gatewayEventStore } from "../state/gateway-events";
import { bindGatewayUser } from "../state/memory";
import type { CloseSubscriber, Subscriber, ThreadOpenSnapshot } from "./types";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";

export class ThreadController {
  readonly client: CodexRpcClient;
  readonly subscribers = new Set<Subscriber>();
  readonly closeSubscribers = new Set<CloseSubscriber>();
  readonly buffer: GatewayEvent[] = [];
  private operationQueue: Promise<unknown> = Promise.resolve();
  private connected = false;
  private subscribed = false;
  private closed = false;
  private openSnapshot: ThreadOpenSnapshot | null = null;

  constructor(
    readonly host: HostRecord,
    readonly threadId: string,
    client?: CodexRpcClient,
    connected = false,
    subscribed = false,
    private readonly ownsClient = true,
    private readonly onClose?: () => void,
  ) {
    this.client = client ?? new CodexRpcClient(host);
    this.connected = connected;
    this.subscribed = subscribed;
    if (this.ownsClient) {
      this.client.on(
        "notification",
        bindGatewayUser((message: any) => this.handleNotification(message)),
      );
      this.client.on(
        "stderr",
        bindGatewayUser((text) => this.handleStderr(text)),
      );
      this.client.on(
        "close",
        bindGatewayUser(() => this.handleClose()),
      );
    }
  }

  publish(method: string, payload: any) {
    const event = gatewayEventStore.add(this.host.id, this.threadId, method, payload);
    this.buffer.push(event);
    if (this.buffer.length > 200) {
      this.buffer.shift();
    }
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
    return event;
  }

  async ensureConnected() {
    if (this.closed) {
      throw new Error("Thread controller is closed");
    }
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  markConnected() {
    this.connected = true;
  }

  handleNotification(message: any) {
    const method = message.method || "notification";
    const event = gatewayEventStore.add(this.host.id, this.threadId, method, message);
    this.buffer.push(event);
    if (this.buffer.length > 200) {
      this.buffer.shift();
    }
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  handleStderr(text: string) {
    const event = gatewayEventStore.add(this.host.id, this.threadId, "gateway/stderr", {
      method: "gateway/stderr",
      params: { text },
    });
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  handleClose() {
    this.connected = false;
    this.subscribed = false;
    for (const subscriber of this.closeSubscribers) {
      subscriber();
    }
    this.closeSubscribers.clear();
  }

  async ensureSubscribed() {
    await this.ensureConnected();
    if (this.subscribed) {
      return;
    }
    if (this.isFreshUnmaterializedThread()) {
      this.subscribed = true;
      return;
    }

    await this.enqueue(() =>
      this.client.request<any>("thread/resume", {
        threadId: this.threadId,
      }),
    );
    this.subscribed = true;
  }

  isSubscribed() {
    return this.subscribed;
  }

  async resumeWithInitialTurns(limit = DEFAULT_TURN_PAGE_LIMIT) {
    await this.ensureConnected();
    const resume = await this.enqueue(() =>
      this.client.request<any>("thread/resume", {
        threadId: this.threadId,
        excludeTurns: true,
        initialTurnsPage: {
          limit,
          sortDirection: "desc",
          itemsView: "full",
        },
      }),
    );
    this.subscribed = true;
    return resume;
  }

  setOpenSnapshot(snapshot: ThreadOpenSnapshot) {
    this.openSnapshot = snapshot;
  }

  getOpenSnapshot() {
    return this.openSnapshot;
  }

  private isFreshUnmaterializedThread() {
    const turns = (this.openSnapshot?.history as any)?.thread?.turns;
    return Boolean(this.openSnapshot && Array.isArray(turns) && turns.length === 0);
  }

  enqueue<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.catch(() => {});
    return run;
  }

  subscribe(callback: Subscriber, onClose?: CloseSubscriber) {
    this.subscribers.add(callback);
    if (onClose) {
      this.closeSubscribers.add(onClose);
    }
    return () => {
      this.subscribers.delete(callback);
      if (onClose) {
        this.closeSubscribers.delete(onClose);
      }
    };
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.connected) {
      void this.client
        .request("thread/unsubscribe", { threadId: this.threadId }, 5_000)
        .catch(() => {});
    }
    this.subscribed = false;
    if (this.ownsClient) {
      this.client.close();
    }
    for (const subscriber of this.closeSubscribers) {
      subscriber();
    }
    this.subscribers.clear();
    this.closeSubscribers.clear();
    this.onClose?.();
  }

  disposeAfterTransportClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.subscribed = false;
    for (const subscriber of this.closeSubscribers) {
      subscriber();
    }
    this.subscribers.clear();
    this.closeSubscribers.clear();
    this.onClose?.();
  }
}
