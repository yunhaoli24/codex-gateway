import { z } from "zod";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret } from "../ssh/ssh-types";
import { codexRemoteDaemonPayload, remoteLoginShellCommand } from "../ssh/remote-command";
import { firstNonEmptyString } from "~~/shared/utils/strings";
import { isCodexVersionAtLeast, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { codexUpgradeLog } from "./codex-upgrade-log";
import { CodexDaemonOwnershipError } from "./codex-daemon-errors";

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
const startedResponseSchema = z.object({
  status: z.enum(["started", "alreadyRunning"]),
  // Official lifecycle JSON omits backend when the responding socket has no managed owner.
  backend: z.literal("pid").optional(),
  managedCodexVersion: versionSchema.nullable(),
  appServerVersion: versionSchema,
});
const updateResponseSchema = z.object({
  status: z.literal("updated"),
  installedVersion: versionSchema,
  runningVersion: versionSchema,
});
const restartResponseSchema = z.object({ status: z.literal("restarted") });

export class CodexDaemon {
  constructor(private readonly ssh: SshConnectionPool) {}

  async ensureVersion(host: HostWithSecret, cliVersion: string, beforeUpdate: () => void) {
    // `start` is idempotent; bootstrap always restarts an existing daemon. Let Codex resolve
    // socket ownership, prepare an initial package and preserve saved launch settings here.
    // A local proxy does not require enabling Codex's separate cloud remote-control service.
    const started = startedResponseSchema.parse(await this.command(host, "start"));
    codexUpgradeLog("daemon runtime inspected", host, {
      status: started.status,
      backend: started.backend ?? "external",
      cliVersion,
      managedCodexVersion: started.managedCodexVersion,
      appServerVersion: started.appServerVersion,
    });
    // `alreadyRunning` proves socket readiness, not daemon ownership. External clients may use
    // a different package selection; only their live protocol version matters to Gateway. Never
    // force daemon update/restart on them: Codex deliberately refuses that takeover.
    if (started.backend === undefined) {
      if (!isCodexVersionAtLeast(started.appServerVersion, SUPPORTED_CODEX_VERSION)) {
        throw new CodexDaemonOwnershipError(
          `${host.name} 的 App Server ${started.appServerVersion} 不由 Codex daemon 管理，需要 ${SUPPORTED_CODEX_VERSION} 或更高版本。请关闭原客户端或由其管理员停止旧 App Server，然后点击主机重连。`,
        );
      }
      codexUpgradeLog("external app server reused", host, {
        appServerVersion: started.appServerVersion,
      });
      return { version: started.appServerVersion, updated: false };
    }
    if (
      started.managedCodexVersion !== null &&
      isCodexVersionAtLeast(started.managedCodexVersion, cliVersion) &&
      isCodexVersionAtLeast(started.appServerVersion, cliVersion)
    ) {
      return { version: started.appServerVersion, updated: false };
    }

    beforeUpdate();
    // CLI and daemon have independent package selections. Restarting after only replacing
    // standalone/current can keep running the old daemon package. This official offline update
    // copies the complete CLI package, pins it, drains work with the configured grace period and
    // restores eligible threads/Goals. Do not add active-thread polling or a turn-completed hook:
    // they duplicate Codex's shutdown/recovery policy and can defer upgrades indefinitely.
    const updated = updateResponseSchema.parse(await this.command(host, "update --from-cli --yes"));
    if (
      !isCodexVersionAtLeast(updated.installedVersion, cliVersion) ||
      !isCodexVersionAtLeast(updated.runningVersion, cliVersion)
    ) {
      throw new Error(`Codex daemon update did not select and start version ${cliVersion}`);
    }
    return { version: updated.runningVersion, updated: true };
  }

  async restart(host: HostWithSecret) {
    restartResponseSchema.parse(await this.command(host, "restart"));
  }

  private async command(host: HostWithSecret, command: string): Promise<unknown> {
    // No Gateway PID scans, socket deletion, stop/start pair or SSH disconnect: official lifecycle
    // commands own recovery and must leave the shared, possibly MFA-authenticated SSH intact.
    // The timeout covers the official maximum five-minute shutdown grace plus package preparation.
    const startedAt = Date.now();
    // CLI version inspection and daemon readiness are separate steps; name the lifecycle command
    // so an SSH channel timeout cannot be mistaken for a failed version comparison in Docker logs.
    codexUpgradeLog("daemon lifecycle command started", host, { command });
    const result = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteDaemonPayload(command)),
      { timeoutMs: 7 * 60_000, maxOutputBytes: 64 * 1024 },
    );
    if (result.code !== 0) {
      const message =
        firstNonEmptyString([result.stderr, result.stdout]) ?? `Codex daemon ${command} failed`;
      // Ownership can change after `start`, or a user can request a restart of an external
      // process. Preserve the same actionable/non-retryable result for the official refusal.
      if (message.includes("app server is running but is not managed by codex app-server daemon")) {
        throw new CodexDaemonOwnershipError(
          `${host.name} 的 App Server 不由 Codex daemon 管理。请关闭原客户端或由其管理员停止该 App Server，然后点击主机重连。`,
        );
      }
      throw new Error(message);
    }
    const response: unknown = JSON.parse(result.stdout);
    codexUpgradeLog("daemon lifecycle command completed", host, {
      command,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}

export async function restartCodexDaemon(ssh: SshConnectionPool, host: HostWithSecret) {
  await new CodexDaemon(ssh).restart(host);
}
