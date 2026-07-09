import { EventEmitter } from "node:events";
import WebSocket, { type RawData } from "ws";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { SUPPORTED_CODEX_VERSION } from "./codex-version";
import { codexRuntime, sshConnections } from "./host-services";
import { hostLifecycleBus } from "../state/host-events";
import {
  codexRemoteAppServerExistingProxyPayload,
  codexRemoteAppServerProxyPayload,
  remoteLoginShellCommand,
} from "./remote-command";
import { CodexRpcError } from "../http/errors";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export type RpcNotificationHandler = (message: RpcEnvelope) => void;

export class CodexRpcTransportError extends Error {
  constructor(
    message: string,
    readonly detail: {
      hostId: number;
      hostName: string;
      phase: string;
      stderr: string;
      code: number | null;
      signal: string | null;
    },
    cause?: unknown,
  ) {
    super(formatTransportErrorMessage(message, detail), { cause });
    this.name = "CodexRpcTransportError";
  }
}

function rawWebSocketDataToString(data: RawData) {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

interface CodexRpcClientOptions {
  skipVersionCheck?: boolean;
  requireExistingAppServer?: boolean;
}

const officialTuiClientInfo = {
  name: "codex-tui",
  title: null,
  version: SUPPORTED_CODEX_VERSION,
};

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

    let versionState = this.options.skipVersionCheck
      ? null
      : await codexRuntime.ensureCodexVersion(this.host);

    try {
      await this.connectRemoteProxyWebSocket();
    } catch (error) {
      if (this.options.skipVersionCheck) {
        throw error;
      }
      versionState = await codexRuntime.repairAfterProxyFailure(this.host, error);
      await this.connectRemoteProxyWebSocket();
    }

    await this.request(
      "initialize",
      {
        clientInfo: {
          ...officialTuiClientInfo,
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
      message: [
        versionState?.upgraded
          ? `Upgraded Codex ${versionState.beforeVersion} -> ${versionState.version}`
          : null,
        versionState ? `codex-cli ${versionState.version}` : null,
        "app-server RPC OK",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  async probeRuntimeVersion() {
    await this.connectRemoteProxyWebSocket();
    try {
      const result = await this.request<{ userAgent?: string }>(
        "initialize",
        {
          clientInfo: {
            ...officialTuiClientInfo,
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
    this.closeWebSocket();
  }

  private closeWebSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) {
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  private async connectRemoteProxyWebSocket() {
    this.stderrBuffer = "";
    const channel = await sshConnections.execChannel(
      this.host,
      remoteLoginShellCommand(
        this.options.requireExistingAppServer
          ? codexRemoteAppServerExistingProxyPayload()
          : codexRemoteAppServerProxyPayload(),
      ),
    );
    this.transportClosed = false;
    let closeDetail: { code: number | null; signal: string | null } = {
      code: null,
      signal: null,
    };

    channel.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000);
      this.emit("stderr", text);
    });
    channel.on("close", (code: number | null, signal: string | null) => {
      closeDetail = { code, signal };
      this.handleTransportClose(this.closedMessage(code, signal), { code, signal });
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      const settleReject = (error: unknown, phase: string) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(this.transportError(phase, error, closeDetail));
      };
      const ws = new WebSocket("ws://localhost/rpc", {
        createConnection: () => channel,
        perMessageDeflate: false,
      });
      this.ws = ws;
      ws.on("open", settleResolve);
      ws.on("message", (data) => this.handleMessage(rawWebSocketDataToString(data)));
      ws.on("error", (error) => settleReject(error, "websocketHandshake"));
      channel.on("error", (error: Error) => settleReject(error, "sshChannel"));
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
    this.rejectPending(this.transportError("transport", new Error(message), detail));
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

  private transportError(
    phase: string,
    error: unknown,
    detail: { code: number | null; signal: string | null },
  ) {
    const message =
      phase === "websocketHandshake"
        ? "Codex RPC remote proxy WebSocket handshake failed"
        : phase === "sshChannel"
          ? "Codex RPC SSH channel failed"
          : "Codex RPC transport failed";
    return new CodexRpcTransportError(
      causeMessage(message, error),
      {
        hostId: this.host.id,
        hostName: this.host.name || this.host.sshHost,
        phase,
        stderr: this.stderrBuffer.trim(),
        code: detail.code,
        signal: detail.signal,
      },
      error,
    );
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

function causeMessage(prefix: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail ? `${prefix}: ${detail}` : prefix;
}

function formatTransportErrorMessage(message: string, detail: CodexRpcTransportError["detail"]) {
  const parts = [
    `host=${detail.hostName}#${detail.hostId}`,
    `phase=${detail.phase}`,
    detail.code == null ? null : `channelExit=${detail.code}`,
    detail.signal ? `signal=${detail.signal}` : null,
    detail.stderr ? `remoteStderr=${detail.stderr}` : "remoteStderr=<empty>",
  ].filter(Boolean);
  return `${message} (${parts.join(", ")})`;
}
