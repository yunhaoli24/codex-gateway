import { parseCodexVersion } from "./codex-version";
import { LocalHttpConnectProxy } from "./http-connect-proxy";
import { codexRemoteUpgradeAndRestartPayload, remoteLoginShellCommand } from "./remote-command";
import type { SshConnectionPool } from "./ssh-connection";
import type { CommandResult, HostWithSecret } from "./ssh-types";

const UPGRADE_ATTEMPTS = 3;
const UPGRADE_IDLE_TIMEOUT_MS = 90_000;
const UPGRADE_TOTAL_TIMEOUT_MS = 30 * 60_000;

interface UpgradeCommandResult extends CommandResult {
  closedBeforeExitStatus: boolean;
  exitSignal: string | null;
  exitDescription: string | null;
  exitCoreDumped: boolean | null;
}

export class CodexUpgrader {
  constructor(private readonly ssh: SshConnectionPool) {}

  async upgrade(host: HostWithSecret, version: string) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= UPGRADE_ATTEMPTS; attempt += 1) {
      try {
        return await this.upgradeOnce(host, version);
      } catch (error) {
        lastError = error;
        if (attempt >= UPGRADE_ATTEMPTS || !isTransientUpgradeError(error)) {
          throw error;
        }
        console.info("[gateway-upgrade] retrying transient Codex upgrade failure", {
          hostId: host.id,
          hostName: host.name,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: UPGRADE_ATTEMPTS,
          message: error instanceof Error ? error.message : String(error),
        });
        await delay(1_000 * attempt);
      }
    }
    throw lastError;
  }

  private async upgradeOnce(host: HostWithSecret, version: string) {
    const proxy = new LocalHttpConnectProxy();
    const localProxyPort = await proxy.listen();
    const result = await this.ssh
      .withReverseTcpForward(
        host,
        {
          remoteHost: "127.0.0.1",
          remotePort: 0,
          targetHost: "127.0.0.1",
          targetPort: localProxyPort,
        },
        async (remoteProxyPort) =>
          await this.execUpgradeCommand(
            host,
            remoteLoginShellCommand(
              codexRemoteUpgradeAndRestartPayload(version, `http://127.0.0.1:${remoteProxyPort}`),
            ),
          ),
      )
      .finally(async () => {
        await proxy.close();
      });
    if (result.code !== 0) {
      throw new Error(upgradeFailureMessage(result));
    }
    const parsed = parseCodexVersion(result.stdout);
    if (!parsed) {
      throw new Error(`Unable to parse upgraded remote Codex version: ${result.stdout.trim()}`);
    }
    return parsed.version;
  }

  private async execUpgradeCommand(host: HostWithSecret, command: string) {
    const channel = await this.ssh.execChannel(host, command);

    return await new Promise<UpgradeCommandResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let exitStatusReceived = false;
      let exitCode: number | null = null;
      let exitSignal: string | null = null;
      let exitDescription: string | null = null;
      let exitCoreDumped: boolean | null = null;
      let idleTimer: NodeJS.Timeout | null = null;
      let totalTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
        }
        if (totalTimer) {
          clearTimeout(totalTimer);
        }
      };

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback();
      };

      const resetIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
        }
        idleTimer = setTimeout(() => {
          this.ssh.disconnectHost(host);
          channel.close();
          settle(() =>
            reject(
              new Error(
                [
                  `Timed out upgrading remote Codex after ${Math.round(UPGRADE_IDLE_TIMEOUT_MS / 1000)}s without output`,
                  stderr.trim() ? `stderr tail:\n${tail(stderr, 2000)}` : null,
                  stdout.trim() ? `stdout tail:\n${tail(stdout, 2000)}` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              ),
            ),
          );
        }, UPGRADE_IDLE_TIMEOUT_MS);
      };

      resetIdleTimer();
      totalTimer = setTimeout(() => {
        this.ssh.disconnectHost(host);
        channel.close();
        settle(() =>
          reject(
            new Error(
              `Timed out upgrading remote Codex after ${Math.round(UPGRADE_TOTAL_TIMEOUT_MS / 60_000)}m total`,
            ),
          ),
        );
      }, UPGRADE_TOTAL_TIMEOUT_MS);

      channel.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        resetIdleTimer();
      });
      channel.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
        resetIdleTimer();
      });
      channel.on("error", (error: Error) => {
        settle(() => reject(error));
      });
      channel.on(
        "exit",
        (
          code: number | null,
          signal: string | null,
          coreDumped: boolean | null,
          description: string | null,
        ) => {
          exitStatusReceived = true;
          exitCode = code;
          exitSignal = signal;
          exitCoreDumped = coreDumped;
          exitDescription = description;
        },
      );
      channel.on("close", () => {
        settle(() =>
          resolve({
            code: exitStatusReceived ? exitCode : null,
            stdout,
            stderr,
            closedBeforeExitStatus: !exitStatusReceived,
            exitSignal,
            exitDescription,
            exitCoreDumped,
          }),
        );
      });
    });
  }
}

function tail(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value.trim();
  }
  return value.slice(-maxLength).trim();
}

function upgradeFailureMessage(result: UpgradeCommandResult) {
  return [
    upgradeExitSummary(result),
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
    result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function upgradeExitSummary(result: UpgradeCommandResult) {
  if (result.closedBeforeExitStatus) {
    return "Failed to upgrade remote Codex: SSH channel closed before remote exit status";
  }
  const signal = result.exitSignal ? `, signal ${result.exitSignal}` : "";
  const coreDumped = result.exitCoreDumped ? ", core dumped" : "";
  const description = result.exitDescription ? `, description: ${result.exitDescription}` : "";
  return `Failed to upgrade remote Codex (exit ${result.code ?? "null"}${signal}${coreDumped}${description})`;
}

function isTransientUpgradeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /SSH channel closed before remote exit status|Timed out upgrading remote Codex|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network timeout|network socket|TLS|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout/i.test(
    message,
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
