import type { HostRecord } from "~~/shared/types";
import { HostRpcSession } from "./host-rpc-session";
import { ThreadController } from "./thread-controller";

export class ControllerRegistry {
  private readonly controllers = new Map<string, ThreadController>();
  private readonly hostSessions = new Map<number, HostRpcSession>();

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
    let session = this.hostSessions.get(host.id);
    if (!session) {
      session = new HostRpcSession(
        host,
        (hostId, threadId) => this.controllers.get(this.key(hostId, threadId)) ?? null,
        (hostId) => this.controllersForHost(hostId),
        () => this.disposeHostSession(host.id, session),
      );
      this.hostSessions.set(host.id, session);
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
    const session = this.hostSessions.get(hostId);
    this.hostSessions.delete(hostId);
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
    if (session && this.hostSessions.get(hostId) === session) {
      this.hostSessions.delete(hostId);
    }
    for (const controller of this.controllersForHost(hostId)) {
      controller.disposeAfterTransportClose();
      this.controllers.delete(this.key(hostId, controller.threadId));
    }
  }

  private key(hostId: number, threadId: string) {
    return `${hostId}:${threadId}`;
  }
}
