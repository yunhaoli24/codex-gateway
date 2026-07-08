export function isRecoverableCodexInstallError(error: unknown) {
  const message = messageFromError(error);
  return /codex executable not found|Missing optional dependency @openai\/codex-|Cannot find module .*@openai\/codex-|Failed to read remote Codex version|failed to connect to socket at .*app-server-control\.sock|app-server proxy.*not found|codex app-server proxy/i.test(
    message,
  );
}

export function isAppServerProxyStartupFailure(error: unknown) {
  const message = messageFromError(error);
  return /Codex RPC remote proxy WebSocket handshake failed|Codex RPC transport closed|socket hang up|ECONNRESET|EPIPE/i.test(
    message,
  );
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return [error.message, cause instanceof Error ? cause.message : null]
      .filter(Boolean)
      .join("\n");
  }
  return String(error);
}
