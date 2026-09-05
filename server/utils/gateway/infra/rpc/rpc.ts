import { EventEmitter } from "@posva/event-emitter";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { parseRpcEnvelope } from "~~/shared/runtime/app-server";
import { SUPPORTED_CODEX_VERSION } from "../codex/codex-version";
import { codexRuntime } from "../host-services";
import { hostLifecycleBus } from "../../state/host-events";
import { RpcRequestBroker } from "./rpc-request-broker";
import {
  CodexRpcTransport,
  type CodexRpcTransportOptions,
  type RpcTransport,
} from "./rpc-transport";
import { type RpcTransportCloseDetail } from "./rpc-errors";
import { parseInitializeResponse } from "~~/shared/runtime/app-server";

export type RpcNotificationHandler = (message: RpcEnvelope) => void;
export type RpcResponseParser<T> = (value: unknown) => T;

export interface CodexRpcClientOptions {
  skipVersionCheck?: boolean;
  requireExistingAppServer?: boolean;
  transportFactory?: (host: HostRecord, options: CodexRpcTransportOptions) => RpcTransport;
}

const officialTuiClientInfo = {
  name: "codex-tui",
  title: null,
  version: SUPPORTED_CODEX_VERSION,
};

type CodexRpcClientEvents = {
  notification: RpcEnvelope;
  request: RpcEnvelope;
  stderr: string;
  close: RpcTransportCloseDetail;
  protocolError: unknown;
};

export class CodexRpcClient extends EventEmitter<CodexRpcClientEvents> {
  private initialized = false;
  private connectPromise: Promise<void> | null = null;
  private connectionGeneration = 0;
  private readonly requests = new RpcRequestBroker();
  private transport: RpcTransport | null = null;
  private deferredUpgrade = false;

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
    if (this.connectPromise !== null) {
      return this.connectPromise;
    }

    const generation = this.connectionGeneration;
    const pending = this.doConnect(generation).finally(() => {
      if (this.connectPromise === pending) this.connectPromise = null;
    });
    this.connectPromise = pending;
    return pending;
  }

  private async doConnect(generation: number) {
    if (this.initialized) {
      return;
    }

    let versionState =
      this.options.skipVersionCheck === true
        ? null
        : await codexRuntime.ensureCodexVersion(this.host);
    this.assertCurrentConnection(generation);
    this.deferredUpgrade = versionState?.deferredUpgrade === true;

    try {
      await this.connectRemoteProxyWebSocket(generation);
    } catch (error) {
      this.assertCurrentConnection(generation);
      if (this.options.skipVersionCheck === true) {
        throw error;
      }
      versionState = await codexRuntime.repairAfterProxyFailure(this.host, error);
      this.assertCurrentConnection(generation);
      await this.connectRemoteProxyWebSocket(generation);
    }

    await this.request(
      "initialize",
      {
        clientInfo: {
          ...officialTuiClientInfo,
        },
        capabilities: {
          experimentalApi: true,
          // Codex negotiates MCP extensions by their protocol names. Gateway renders
          // OpenAI forms and the current MCP elicitation form capability. These are independent
          // protocol extensions, not compatibility branches for older app-server versions.
          extensions: {
            "openai/form": {},
            "openai/elicitation": { form: {} },
          },
        },
      },
      30_000,
    );
    this.assertCurrentConnection(generation);
    this.notify("initialized", {});
    this.initialized = true;
    hostLifecycleBus.emit({
      hostId: this.host.id,
      status: "connected",
      message: [
        versionState?.upgraded === true
          ? `Upgraded Codex ${versionState.beforeVersion} -> ${versionState.version}`
          : null,
        versionState === null ? null : `codex-cli ${versionState.version}`,
        "app-server RPC OK",
      ]
        .filter((value): value is string => value !== null)
        .join("\n"),
    });
  }

  async probeRuntimeVersion() {
    const generation = this.connectionGeneration;
    await this.connectRemoteProxyWebSocket(generation);
    try {
      const result = await this.request(
        "initialize",
        {
          clientInfo: {
            ...officialTuiClientInfo,
          },
          capabilities: {},
        },
        30_000,
        parseInitializeResponse,
      );
      this.notify("initialized", {});
      return result.userAgent ?? null;
    } finally {
      this.close();
    }
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
  ): Promise<unknown> | Promise<T> {
    const response = this.requests.request(method, params, timeoutMs, (message) =>
      this.send(message),
    );
    return parse === undefined ? response : response.then(parse);
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
    // SSH package installation cannot be reliably aborted once the remote command has started.
    // Advancing the generation instead prevents that obsolete async path from publishing a new
    // transport after Host deletion/reconfiguration has already closed this client.
    this.connectionGeneration += 1;
    this.initialized = false;
    this.connectPromise = null;
    this.requests.rejectAll(new Error("Codex RPC client closed"));
    this.transport?.close();
    this.transport = null;
  }

  hasDeferredUpgrade() {
    return this.deferredUpgrade;
  }

  resolveDeferredUpgrade() {
    this.deferredUpgrade = false;
  }

  private async connectRemoteProxyWebSocket(generation: number) {
    this.assertCurrentConnection(generation);
    const transportOptions: CodexRpcTransportOptions = {
      requireExistingAppServer: this.options.requireExistingAppServer === true,
      onMessage: (payload) => this.handleMessage(payload),
      onStderr: (text) => this.emit("stderr", text),
      // A failed upgrade/retry attempt can close after its replacement transport is already live.
      // Ignore that stale channel; otherwise it would tear down the healthy replacement client.
      onClose: (error, detail) => {
        if (this.transport === transport) this.handleTransportClose(error, detail);
      },
    };
    const transport =
      this.options.transportFactory?.(this.host, transportOptions) ??
      new CodexRpcTransport(this.host, transportOptions);
    this.transport = transport;
    try {
      await transport.connect();
      this.assertCurrentConnection(generation);
    } catch (error) {
      if (this.transport === transport) this.transport = null;
      transport.close();
      throw error;
    }
  }

  private assertCurrentConnection(generation: number) {
    if (generation !== this.connectionGeneration) {
      throw new Error("Codex RPC connection attempt was superseded");
    }
  }

  private handleTransportClose(error: Error, detail: RpcTransportCloseDetail) {
    this.initialized = false;
    this.transport = null;
    this.emit("close", detail);
    this.requests.rejectAll(error);
  }

  private send(message: RpcEnvelope) {
    if (this.transport === null) throw new Error("Codex RPC transport is not connected");
    this.transport.send(message);
  }

  private handleMessage(payload: string) {
    if (payload.trim() === "") {
      return;
    }

    let message: RpcEnvelope;
    try {
      message = parseRpcEnvelope(JSON.parse(payload));
    } catch (error) {
      this.emit("protocolError", error);
      const protocolError =
        error instanceof Error ? error : new Error("Codex RPC returned an invalid envelope");
      const transport = this.transport;
      // An invalid response may belong to a pending request. Keeping the stream alive would turn a
      // protocol failure into a long request timeout, so fail the whole generation immediately and
      // let the Host session reconnect through the normal lifecycle.
      this.handleTransportClose(protocolError, { code: null, signal: null });
      transport?.close();
      return;
    }

    if (message.id !== undefined && message.method !== undefined && message.method !== "") {
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
