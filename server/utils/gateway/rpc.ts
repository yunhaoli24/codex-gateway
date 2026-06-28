import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { hostManager } from "./ssh";
import { hostLifecycleBus } from "./host-events";
import {
  codexRemoteAppServerExistingProxyPayload,
  codexRemoteAppServerProxyPayload,
  remoteLoginShellCommand,
} from "./remote-command";
import { CodexRpcError } from "./errors";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export type RpcNotificationHandler = (message: RpcEnvelope) => void;

interface CodexRpcClientOptions {
  skipVersionCheck?: boolean;
  requireExistingAppServer?: boolean;
}

export class CodexRpcClient extends EventEmitter {
  private nextId = 1;
  private initialized = false;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<number, PendingRequest>();
  private ws: WebSocket | null = null;
  private stderrBuffer = "";
  private transportClosed = false;

  constructor(
    private readonly host: HostRecord,
    private readonly options: CodexRpcClientOptions = {},
  ) {
    super();
  }

  async connect() {
    if (this.initialized) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async doConnect() {
    if (this.initialized) {
      return;
    }

    if (!this.options.skipVersionCheck) {
      await hostManager.ensureCodexVersion(this.host);
    }

    await this.connectRemoteProxyWebSocket();

    await this.request(
      "initialize",
      {
        clientInfo: {
          name: "codex_gateway",
          title: "Codex Gateway",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
          mcpServerOpenaiFormElicitation: true,
        },
      },
      30_000,
    );
    this.notify("initialized", {});
    this.initialized = true;
    hostLifecycleBus.emit({
      hostId: this.host.id,
      status: "connected",
      message: `${this.host.name || this.host.sshHost} 已连接`,
    });
  }

  async probeRuntimeVersion() {
    await this.connectRemoteProxyWebSocket();
    try {
      const result = await this.request<{ userAgent?: string }>(
        "initialize",
        {
          clientInfo: {
            name: "codex_gateway_probe",
            title: "Codex Gateway Probe",
            version: "0.1.0",
          },
          capabilities: {},
        },
        30_000,
      );
      this.notify("initialized", {});
      return result.userAgent ?? null;
    } finally {
      this.close();
    }
  }

  request<T = unknown>(method: string, params: unknown = {}, timeoutMs = 120_000): Promise<T> {
    const id = this.nextId++;
    const message = { id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex RPC request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      this.send(message);
    });
  }

  notify(method: string, params: unknown) {
    this.send({ method, params });
  }

  respond(id: string | number, result: unknown) {
    this.send({ id, result });
  }

  respondError(id: string | number, code: number, message: string, data?: unknown) {
    this.send({
      id,
      error: {
        code,
        message,
        data,
      },
    });
  }

  close() {
    this.initialized = false;
    this.connectPromise = null;
    this.transportClosed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex RPC client closed"));
    }
    this.pending.clear();
    this.ws?.close();
  }

  private async connectRemoteProxyWebSocket() {
    const channel = await hostManager.execChannel(
      this.host,
      remoteLoginShellCommand(
        this.options.requireExistingAppServer
          ? codexRemoteAppServerExistingProxyPayload()
          : codexRemoteAppServerProxyPayload(),
      ),
    );
    this.transportClosed = false;

    channel.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000);
      this.emit("stderr", text);
    });
    channel.on("close", (code: number | null, signal: string | null) => {
      this.handleTransportClose(this.closedMessage(code, signal), { code, signal });
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket("ws://localhost/rpc", {
        createConnection: () => channel,
        perMessageDeflate: false,
      });
      this.ws = ws;
      ws.on("open", () => resolve());
      ws.on("message", (data) => this.handleMessage(data.toString()));
      ws.on("error", reject);
      ws.on("close", () => {
        this.handleTransportClose("Codex RPC remote proxy WebSocket closed", {
          code: null,
          signal: null,
        });
      });
    });
  }

  private handleTransportClose(
    message: string,
    detail: { code: number | null; signal: string | null },
  ) {
    if (this.transportClosed) {
      return;
    }
    this.transportClosed = true;
    this.initialized = false;
    this.ws = null;
    this.emit("close", detail);
    this.rejectPending(new Error(message));
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private closedMessage(code: number | null, signal: string | null) {
    const detail = [
      code == null ? null : `code ${code}`,
      signal ? `signal ${signal}` : null,
      this.stderrBuffer.trim() ? `stderr: ${this.stderrBuffer.trim()}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return detail ? `Codex RPC transport closed (${detail})` : "Codex RPC transport closed";
  }

  private send(message: RpcEnvelope) {
    if (!this.ws) {
      throw new Error("Codex RPC transport is not connected");
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Codex RPC transport is not open: readyState ${this.ws.readyState}`);
    }
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(payload: string) {
    if (!payload.trim()) {
      return;
    }

    let message: RpcEnvelope;
    try {
      message = JSON.parse(payload);
    } catch (error) {
      this.emit("protocolError", error);
      return;
    }

    if (message.id !== undefined && message.method) {
      this.emit("request", message);
      return;
    }

    if (message.id !== undefined) {
      const id = Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (message.error) {
        pending.reject(
          new CodexRpcError(
            pending.method,
            message.error.code,
            message.error.message,
            message.error.data,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.emit("notification", message);
  }
}
