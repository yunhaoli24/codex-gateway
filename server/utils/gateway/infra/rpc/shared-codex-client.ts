import { EventEmitter } from "@posva/event-emitter";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { recordFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import { bindGatewayUser } from "../../state/memory";
import { remoteHosts } from "../../state/remote-hosts";
import { threadSnapshotStore } from "../../state/thread-snapshots";
import { gatewayEventStore } from "../../state/gateway-events";
import { threadTimelinePageStore } from "../../state/thread-timeline-pages";
import { sshConnections } from "../host-services";
import { resolveSshConfig } from "../ssh/ssh-config";
import { remoteLoginShellCommand } from "../ssh/remote-command";
import { hostLifecycleBus } from "../../state/host-events";
import { CodexRpcClient, type CodexRpcClientEvents, type RpcResponseParser } from "./rpc";

interface SharedConnection {
  epoch: string;
  client: CodexRpcClient;
  ready: Promise<void>;
  members: Set<SharedCodexClient>;
  subscriptions: Map<string, Set<SharedCodexClient>>;
  pendingRequests: Set<string | number>;
  releaseTransport: () => void;
}

const connections = new Map<string, SharedConnection>();
type SharedClientEvents = Omit<CodexRpcClientEvents, "notification" | "request" | "stderr"> & {
  notification: [RpcEnvelope];
  request: [RpcEnvelope];
  stderr: [text: string, deliveryToken: object];
};

/** Each Host session owns a lease, not an RPC socket. SSH authentication remains user-scoped;
 * authenticated aliases of the same remote account/CODEX_HOME multiplex one official connection.
 * Thread subscriptions are reference-counted here because unsubscribe is connection-wide upstream.
 * Keeping this below HostRpcSession preserves user-specific controllers, MFA and notifications. */
export class SharedCodexClient extends EventEmitter<SharedClientEvents> {
  private connection: SharedConnection | null = null;
  private remoteKey: string | null = null;
  private generation = 0;
  private connectPromise: Promise<void> | null = null;
  private stopObservingSsh: (() => void) | null = null;
  private readonly inUserScope = bindGatewayUser((deliver: () => void) => deliver());

  constructor(private readonly host: HostRecord) {
    super();
  }

  async connect() {
    if (this.connection !== null) return this.connection.ready;
    if (this.connectPromise !== null) return this.connectPromise;
    const generation = this.generation;
    const pending = this.acquire(generation)
      .catch((error: unknown) => {
        if (generation === this.generation) this.close();
        throw error;
      })
      .finally(() => {
        if (this.connectPromise === pending) this.connectPromise = null;
      });
    this.connectPromise = pending;
    return pending;
  }

  private async acquire(generation: number) {
    await sshConnections.connect(this.host);
    const authenticatedSshKey = sshConnections.connectionKeyFor(this.host);
    const authenticatedSshToken = sshConnections.connectionTokenFor(this.host);
    if (generation !== this.generation || authenticatedSshToken === undefined) {
      throw new Error("Codex SSH authentication was superseded");
    }
    // Observe the authenticated generation before opening identity's exec channel. ssh2 closes
    // its Client before draining channels, so an exec result alone cannot prove SSH is still live.
    this.stopObservingSsh = sshConnections.on("closed", ({ connectionKey }) => {
      if (connectionKey !== authenticatedSshKey) return;
      this.inUserScope(() => {
        this.close();
        this.emit("close", { code: null, signal: null });
      });
    });
    // This small identity read also proves this user's SSH/MFA authentication. Never use the
    // configuration's endpoint alone as permission to attach to an existing user's RPC socket.
    const identity = await sshConnections.exec(
      this.host,
      remoteLoginShellCommand('printf "%s\\n%s\\n" "$(id -un)" "${CODEX_HOME:-$HOME/.codex}"'),
      { timeoutMs: 120_000, maxOutputBytes: 16_384 },
    );
    if (identity.code !== 0) throw new Error("Failed to identify remote Codex account");
    const [username, codexHome] = z
      .tuple([z.string().min(1), z.string().min(1)])
      .parse(identity.stdout.trimEnd().split("\n"));
    if (
      generation !== this.generation ||
      sshConnections.connectionTokenFor(this.host) !== authenticatedSshToken
    )
      throw new Error("Codex SSH authentication was superseded");
    const resolved = resolveSshConfig(this.host);
    const key = remoteHosts.identityKey([
      "codex",
      resolved.hostName,
      resolved.port,
      // Private endpoint addresses can mean different machines through different SSH proxies.
      resolved.proxy?.host ?? null,
      resolved.proxy?.port ?? null,
      username,
      codexHome,
    ]);
    this.remoteKey = key;
    let connection = connections.get(key);
    if (connection === undefined) {
      const client = new CodexRpcClient(this.host);
      connection = {
        epoch: randomUUID(),
        client,
        ready: Promise.resolve(),
        members: new Set(),
        subscriptions: new Map(),
        pendingRequests: new Set(),
        releaseTransport: sshConnections.retainTransport(this.host),
      };
      connections.set(key, connection);
      this.wireConnection(key, connection);
      connection.ready = client.connect();
    }
    // A physical reconnect starts a new cache namespace. No RPC observed messages during the
    // offline gap, so old snapshots/replay must expire rather than masquerade as a live replica.
    remoteHosts.bind(this.host, `${key}:${connection.epoch}`, this);
    this.connection = connection;
    connection.members.add(this);
    await connection.ready;
    this.assertCurrentLease(connection, generation);
    hostLifecycleBus.emit({
      hostId: this.host.id,
      status: "connected",
      message: "app-server RPC OK",
    });
  }

  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  request<T>(
    method: string,
    params: unknown,
    timeoutMs: number,
    parse: RpcResponseParser<T>,
  ): Promise<T>;
  request<T>(
    method: string,
    params: unknown = {},
    timeoutMs = 120_000,
    parse?: RpcResponseParser<T>,
  ) {
    const connection = this.requireConnection();
    const generation = this.generation;
    const threadId = stringFromUnknown(recordFromUnknown(params)?.threadId);
    if (method === "thread/unsubscribe" && threadId !== null) {
      const members = connection.subscriptions.get(threadId);
      members?.delete(this);
      if (members !== undefined && members.size > 0) {
        const result: unknown = {};
        return Promise.resolve(parse === undefined ? result : parse(result));
      }
      connection.subscriptions.delete(threadId);
    }
    // Register before sending resume: a different alias releasing its lease while this request
    // is in flight must not unsubscribe the physical connection in the handoff window.
    const isResume = method === "thread/resume" && threadId !== null;
    const wasSubscribed =
      threadId !== null && connection.subscriptions.get(threadId)?.has(this) === true;
    if (isResume) this.retainThread(connection, threadId);
    const response = connection.client.request(method, params, timeoutMs).then(
      (value) => {
        // Another alias may keep the socket alive after this lease is closed/reconfigured.
        // Its late replies must not be projected into this Host's replacement remote namespace.
        this.assertCurrentLease(connection, generation);
        if (method === "thread/start") {
          const startedId = stringFromUnknown(
            recordFromUnknown(recordFromUnknown(value)?.thread)?.id,
          );
          if (startedId !== null) this.retainThread(connection, startedId);
        }
        return parse === undefined ? value : parse(value);
      },
      (error: unknown) => {
        // Errors can trigger recovery RPCs too (for example no-active-turn after steer). Do not
        // let an obsolete lease recover its old Host after the configuration has changed.
        this.assertCurrentLease(connection, generation);
        if (isResume && !wasSubscribed) connection.subscriptions.get(threadId)?.delete(this);
        throw error;
      },
    );
    return response;
  }

  notify(method: string, params: unknown) {
    this.requireConnection().client.notify(method, params);
  }

  respond(id: string | number, result: unknown) {
    const connection = this.requireConnection();
    if (connection.pendingRequests.delete(id)) connection.client.respond(id, result);
  }

  respondError(id: string | number, code: number, message: string, data?: unknown) {
    const connection = this.requireConnection();
    if (connection.pendingRequests.delete(id))
      connection.client.respondError(id, code, message, data);
  }

  close() {
    this.generation += 1;
    this.stopObservingSsh?.();
    this.stopObservingSsh = null;
    this.connectPromise = null;
    const connection = this.connection;
    const key = this.remoteKey;
    this.connection = null;
    this.remoteKey = null;
    this.inUserScope(() => remoteHosts.unbind(this.host.id, this));
    if (connection === null || key === null) return;
    connection.members.delete(this);
    for (const [threadId, members] of connection.subscriptions) {
      if (!members.delete(this) || members.size > 0) continue;
      connection.subscriptions.delete(threadId);
      void connection.client.request("thread/unsubscribe", { threadId }, 5_000).catch(() => {});
    }
    if (connection.members.size === 0) {
      connection.client.close();
      this.releaseConnection(key, connection);
    }
  }

  private retainThread(connection: SharedConnection, threadId: string) {
    const members = connection.subscriptions.get(threadId) ?? new Set();
    members.add(this);
    connection.subscriptions.set(threadId, members);
  }

  private requireConnection() {
    if (this.connection === null) throw new Error("Codex RPC lease is not connected");
    return this.connection;
  }

  private assertCurrentLease(connection: SharedConnection, generation: number) {
    if (generation !== this.generation || this.connection !== connection) {
      throw new Error("Codex RPC lease request was superseded");
    }
  }

  private releaseConnection(key: string, connection: SharedConnection) {
    if (connections.get(key) === connection) connections.delete(key);
    // A disconnected replica cannot prove continuity. Reconnect reads Codex's official timeline;
    // discard the unreachable generation now instead of retaining duplicate payloads until TTL.
    const namespace = `${key}:${connection.epoch}`;
    threadSnapshotStore.deleteForRemote(namespace);
    gatewayEventStore.deleteForRemote(namespace);
    threadTimelinePageStore.deleteForRemote(namespace);
    connection.releaseTransport();
  }

  private wireConnection(key: string, connection: SharedConnection) {
    connection.client.on("notification", (message) => {
      if (message.method === "serverRequest/resolved") {
        const requestId = recordFromUnknown(message.params)?.requestId;
        if (typeof requestId === "string" || typeof requestId === "number") {
          connection.pendingRequests.delete(requestId);
        }
      }
      // The exact same envelope object reaches every alias. The event boundary uses its identity
      // to reduce the provider event once, rather than hashing text or suppressing equal deltas.
      for (const member of connection.members) {
        member.inUserScope(() => member.emit("notification", message));
      }
    });
    connection.client.on("request", (message) => {
      if (message.id !== undefined) connection.pendingRequests.add(message.id);
      for (const member of connection.members) {
        member.inUserScope(() => member.emit("request", message));
      }
    });
    connection.client.on("stderr", (text) => {
      // A background-only alias may have no thread controller. Let every session route stderr;
      // the runtime records each affected thread once using this delivery's object identity.
      const deliveryToken = {};
      for (const member of connection.members) {
        member.inUserScope(() => member.emit("stderr", text, deliveryToken));
      }
    });
    connection.client.on("close", (detail) => {
      this.releaseConnection(key, connection);
      for (const member of connection.members) {
        member.generation += 1;
        member.stopObservingSsh?.();
        member.stopObservingSsh = null;
        member.connection = null;
        member.remoteKey = null;
        member.inUserScope(() => {
          remoteHosts.unbind(member.host.id, member);
          member.emit("close", detail);
        });
      }
      connection.members.clear();
      connection.subscriptions.clear();
      connection.pendingRequests.clear();
    });
  }
}
