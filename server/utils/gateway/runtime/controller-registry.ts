import type { HostRecord } from "~~/shared/types";
import { currentGatewayUserId } from "../state/memory";
import { HostRpcSession } from "./host-rpc-session";
import { ThreadController } from "./thread-controller";

export class ControllerRegistry {
  private readonly controllers = new Map<string, ThreadController>();
  private readonly hostSessions = new Map<string, HostRpcSession>();

  async getController(host: HostRecord, threadId: string) {
    const key = this.key(host.id, threadId);
    let controller = this.controllers.get(key);
    if (!controller) {
      const client = await this.getHostClient(host);
      controller = new ThreadController(host, threadId, client, true, false, false, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key);
        }
      });
      this.controllers.set(key, controller);
    }
    await controller.ensureConnected();
    return controller;
  }

  async attachStartedThread(
    host: HostRecord,
    threadId: string,
    client: Awaited<ReturnType<HostRpcSession["connect"]>>,
  ) {
    const key = this.key(host.id, threadId);
    this.controllers.get(key)?.close();
    const controller = new ThreadController(host, threadId, client, true, true, false, () => {
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key);
      }
    });
    this.controllers.set(key, controller);
    return controller;
  }

  async getHostClient(host: HostRecord) {
    const key = this.hostKey(host.id);
    let session = this.hostSessions.get(key);
    if (!session) {
      session = new HostRpcSession(
        host,
        (hostId, threadId) => this.controllers.get(this.key(hostId, threadId)) ?? null,
        (hostId) => this.controllersForHost(hostId),
        () => this.disposeHostSession(host.id, session),
      );
      this.hostSessions.set(key, session);
    }
    return session.connect();
  }

  controllersForHost(hostId: number) {
    return Array.from(this.controllers.values()).filter(
      (controller) => controller.host.id === hostId,
    );
  }

  close(hostId: number, threadId: string) {
    const key = this.key(hostId, threadId);
    this.controllers.get(key)?.close();
    this.controllers.delete(key);
  }

  closeHost(hostId: number) {
    for (const controller of this.controllersForHost(hostId)) {
      controller.close();
      this.controllers.delete(this.key(hostId, controller.threadId));
    }
    const key = this.hostKey(hostId);
    const session = this.hostSessions.get(key);
    this.hostSessions.delete(key);
    session?.close();
  }

  status() {
    return Array.from(this.controllers.values()).map((controller) => ({
      hostId: controller.host.id,
      threadId: controller.threadId,
      subscribers: controller.subscribers.size,
      eventBufferSize: controller.buffer.length,
    }));
  }

  private disposeHostSession(hostId: number, session: HostRpcSession | undefined) {
    const hostKey = this.hostKey(hostId);
    if (session && this.hostSessions.get(hostKey) === session) {
      this.hostSessions.delete(hostKey);
    }
    for (const controller of this.controllersForHost(hostId)) {
      controller.disposeAfterTransportClose();
      this.controllers.delete(this.key(hostId, controller.threadId));
    }
  }

  private key(hostId: number, threadId: string) {
    return `${this.userKey()}:${hostId}:${threadId}`;
  }

  private hostKey(hostId: number) {
    return `${this.userKey()}:${hostId}`;
  }

  private userKey() {
    const userId = currentGatewayUserId();
    if (!userId) {
      throw new Error("Gateway runtime requires an authenticated user scope");
    }
    return userId;
  }
}
