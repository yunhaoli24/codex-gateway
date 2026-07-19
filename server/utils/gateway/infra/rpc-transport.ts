import WebSocket, { type RawData } from "ws";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { sshConnections } from "./host-services";
import {
  codexRemoteAppServerExistingProxyPayload,
  codexRemoteAppServerProxyPayload,
  remoteLoginShellCommand,
} from "./remote-command";
import { createRpcTransportError, type RpcTransportCloseDetail } from "./rpc-errors";

interface CodexRpcTransportOptions {
  requireExistingAppServer: boolean;
  onMessage: (message: string) => void;
  onStderr: (text: string) => void;
  onClose: (error: Error, detail: RpcTransportCloseDetail) => void;
}

export class CodexRpcTransport {
  private ws: WebSocket | null = null;
  private stderrBuffer = "";
  private closed = false;

  constructor(
    private readonly host: HostRecord,
    private readonly options: CodexRpcTransportOptions,
  ) {}

  async connect() {
    this.stderrBuffer = "";
    this.closed = false;
    const channel = await sshConnections.execChannel(
      this.host,
      remoteLoginShellCommand(
        this.options.requireExistingAppServer
          ? codexRemoteAppServerExistingProxyPayload()
          : codexRemoteAppServerProxyPayload(),
      ),
    );
    let closeDetail: RpcTransportCloseDetail = { code: null, signal: null };
    channel.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000);
      this.options.onStderr(text);
    });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown, phase: "websocketHandshake" | "sshChannel") => {
        const transportError = createRpcTransportError(
          this.host,
          phase,
          this.stderrBuffer.trim(),
          closeDetail,
          error,
        );
        if (!settled) {
          settled = true;
          reject(transportError);
        } else {
          this.closeFromRemote(transportError.message, closeDetail, transportError);
        }
      };
      const ws = new WebSocket("ws://localhost/rpc", {
        createConnection: () => channel,
        perMessageDeflate: false,
      });
      this.ws = ws;
      ws.on("open", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      ws.on("message", (data) => this.options.onMessage(rawWebSocketDataToString(data)));
      ws.on("error", (error) => fail(error, "websocketHandshake"));
      channel.on("error", (error: Error) => fail(error, "sshChannel"));
      channel.on("close", (code: number | null, signal: string | null) => {
        closeDetail = { code, signal };
        const error = createRpcTransportError(
          this.host,
          "transport",
          this.stderrBuffer.trim(),
          closeDetail,
          new Error(this.closedMessage(code, signal)),
        );
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.closeFromRemote(error.message, closeDetail, error);
      });
      ws.on("close", () => {
        const detail = {
          code: null,
          signal: null,
        };
        const error = createRpcTransportError(
          this.host,
          "transport",
          this.stderrBuffer.trim(),
          detail,
          new Error("Codex RPC remote proxy WebSocket closed"),
        );
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.closeFromRemote(error.message, detail, error);
      });
    });
  }

  send(message: RpcEnvelope) {
    if (!this.ws) throw new Error("Codex RPC transport is not connected");
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Codex RPC transport is not open: readyState ${this.ws.readyState}`);
    }
    this.ws.send(JSON.stringify(message));
  }

  close() {
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
    else if (ws.readyState === WebSocket.OPEN) ws.close();
  }

  private closeFromRemote(
    message: string,
    detail: RpcTransportCloseDetail,
    error = createRpcTransportError(
      this.host,
      "transport",
      this.stderrBuffer.trim(),
      detail,
      new Error(message),
    ),
  ) {
    if (this.closed) return;
    this.closed = true;
    this.ws = null;
    this.options.onClose(error, detail);
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
}

function rawWebSocketDataToString(data: RawData) {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}
