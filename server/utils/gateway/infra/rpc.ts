import { EventEmitter } from "node:events";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { SUPPORTED_CODEX_VERSION } from "./codex-version";
import { codexRuntime } from "./host-services";
import { hostLifecycleBus } from "../state/host-events";
import { RpcRequestBroker } from "./rpc-request-broker";
import { CodexRpcTransport } from "./rpc-transport";
import { type RpcTransportCloseDetail } from "./rpc-errors";

export type RpcNotificationHandler = (message: RpcEnvelope) => void;

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
  private initialized = false;
  private connectPromise: Promise<void> | null = null;
  private readonly requests = new RpcRequestBroker();
  private transport: CodexRpcTransport | null = null;

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
    return this.requests.request(method, params, timeoutMs, (message) => this.send(message));
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
    this.requests.rejectAll(new Error("Codex RPC client closed"));
    this.transport?.close();
    this.transport = null;
  }

  private async connectRemoteProxyWebSocket() {
    const transport = new CodexRpcTransport(this.host, {
      requireExistingAppServer: Boolean(this.options.requireExistingAppServer),
      onMessage: (payload) => this.handleMessage(payload),
      onStderr: (text) => this.emit("stderr", text),
      // A failed upgrade/retry attempt can close after its replacement transport is already live.
      // Ignore that stale channel; otherwise it would tear down the healthy replacement client.
      onClose: (error, detail) => {
        if (this.transport === transport) this.handleTransportClose(error, detail);
      },
    });
    this.transport = transport;
    try {
      await transport.connect();
    } catch (error) {
      if (this.transport === transport) this.transport = null;
      transport.close();
      throw error;
    }
  }

  private handleTransportClose(error: Error, detail: RpcTransportCloseDetail) {
    this.initialized = false;
    this.transport = null;
    this.emit("close", detail);
    this.requests.rejectAll(error);
  }

  private send(message: RpcEnvelope) {
    if (!this.transport) throw new Error("Codex RPC transport is not connected");
    this.transport.send(message);
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
      this.requests.handleResponse(message);
      return;
    }

    this.emit("notification", message);
  }
}
