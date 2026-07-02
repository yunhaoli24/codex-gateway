import type { HostWithSecret } from "./ssh-types";

export const SSH_CONNECTION_CLOSED_BEFORE_READY = "SSH connection closed before ready";

const CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_BASE_DELAY_MS = 500;

export async function withSshConnectRetries<T>(
  host: HostWithSecret,
  connectOnce: () => Promise<T>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await connectOnce();
    } catch (error) {
      lastError = error;
      if (attempt >= CONNECT_ATTEMPTS || !isTransientSshConnectError(error)) {
        throw error;
      }
      logSshConnectRetry(host, attempt, error);
      await delay(connectRetryDelay(attempt));
    }
  }
  throw lastError;
}

function isTransientSshConnectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /socket hang up|Timed out while waiting for handshake|SSH connection closed before ready|No response from server|Not connected|Connection lost|Invalid header|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH/i.test(
    message,
  );
}

function connectRetryDelay(attempt: number) {
  return CONNECT_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function logSshConnectRetry(host: HostWithSecret, attempt: number, error: unknown) {
  console.info("[gateway-ssh] retrying transient SSH connect failure", {
    hostId: host.id,
    hostName: host.name,
    sshHost: host.sshHost,
    attempt,
    nextAttempt: attempt + 1,
    maxAttempts: CONNECT_ATTEMPTS,
    message: error instanceof Error ? error.message : String(error),
  });
}
