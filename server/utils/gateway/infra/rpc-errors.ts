import type { HostRecord } from "~~/shared/types";

export interface RpcTransportCloseDetail {
  code: number | null;
  signal: string | null;
}

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

export function createRpcTransportError(
  host: HostRecord,
  phase: string,
  stderr: string,
  detail: RpcTransportCloseDetail,
  cause: unknown,
) {
  const message =
    phase === "websocketHandshake"
      ? "Codex RPC remote proxy WebSocket handshake failed"
      : phase === "sshChannel"
        ? "Codex RPC SSH channel failed"
        : "Codex RPC transport failed";
  return new CodexRpcTransportError(
    causeMessage(message, cause),
    {
      hostId: host.id,
      hostName: host.name || host.sshHost,
      phase,
      stderr,
      code: detail.code,
      signal: detail.signal,
    },
    cause,
  );
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
