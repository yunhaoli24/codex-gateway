import type { HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { CodexRpcClient } from "../infra/rpc";
import { bindGatewayUser } from "../state/memory";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot } from "./types";

export class ThreadController {
  readonly client: CodexRpcClient;
  private operationQueue: Promise<unknown> = Promise.resolve();
  private connected = false;
  private subscribed = false;
  private closed = false;

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
    return threadRuntimeEvents.record(this.host.id, this.threadId, method, payload);
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
    threadRuntimeEvents.record(this.host.id, this.threadId, method, message, {
      resolveGoal: () =>
        this.enqueue(() => this.client.request("thread/goal/get", { threadId: this.threadId })),
      resolveThread: () =>
        this.enqueue(() =>
          this.client.request("thread/read", { threadId: this.threadId, includeTurns: false }),
        ),
    });
  }

  handleStderr(text: string) {
    threadRuntimeEvents.record(this.host.id, this.threadId, "gateway/stderr", {
      method: "gateway/stderr",
      params: { text },
    });
  }

  handleClose() {
    this.connected = false;
    this.subscribed = false;
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

  async resumeWithInitialTurns(limit = INITIAL_TURN_PAGE_LIMIT) {
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
    threadSnapshotStore.set(this.host.id, this.threadId, snapshot);
  }

  getOpenSnapshot() {
    return threadSnapshotStore.get(this.host.id, this.threadId);
  }

  private isFreshUnmaterializedThread() {
    const snapshot = this.getOpenSnapshot();
    const turns = (snapshot?.history as any)?.thread?.turns;
    return Boolean(snapshot && Array.isArray(turns) && turns.length === 0);
  }

  enqueue<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.catch(() => {});
    return run;
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
    this.onClose?.();
  }

  disposeAfterTransportClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.subscribed = false;
    this.onClose?.();
  }
}
