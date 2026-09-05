import { isTransientSftpTransferError } from "../ssh/ssh-transfer";

export function isTransientUpgradeError(error: unknown) {
  if (isTransientSftpTransferError(error)) return true;
  return /SSH channel closed before remote exit status|Timed out installing remote Codex|Remote command timed out/i.test(
    messageFromError(error),
  );
}

// Reinstallation is destructive and bandwidth-heavy, so only classify failures that prove the
// npm-managed executable or its official platform package is absent. Socket and transport errors
// describe app-server startup/connectivity, not a corrupt installation.
export function isRecoverableCodexInstallError(error: unknown) {
  const message = messageFromError(error);
  return /codex executable not found|Missing optional dependency @openai\/codex-|Cannot find module .*@openai\/codex-/i.test(
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
