import type { HostWithSecret, RemoteCodexVersionState } from "./ssh-types";
import {
  codexRemoteAppServerRuntimeStatePayload,
  codexRemoteTerminateUnmanagedAppServerPayload,
  codexRemoteAppServerVerifyPayload,
  codexRemoteUpgradeAndRestartPayload,
  codexRemoteVersionPayload,
  remoteLoginShellCommand,
} from "./remote-command";
import { isCodexVersionAtLeast, parseCodexVersion, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { hostLifecycleBus } from "../state/host-events";
import type { SshConnectionPool } from "./ssh-connection";

export class CodexRuntimeService {
  private readonly versionChecks = new Map<number, Promise<RemoteCodexVersionState>>();

  constructor(private readonly ssh: SshConnectionPool) {}

  async verify(host: HostWithSecret) {
    const versionState = await this.ensureCodexVersion(host);
    const probe = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteAppServerVerifyPayload()),
    );
    if (probe.code !== 0) {
      return {
        ok: false,
        code: probe.code,
        stdout: probe.stdout.trim(),
        stderr: probe.stderr.trim(),
      };
    }

    const { CodexRpcClient } = await import("./rpc");
    const client = new CodexRpcClient(host);
    try {
      await client.connect();
      const threads = await client.request(
        "thread/list",
        { limit: 1, useStateDbOnly: true },
        30_000,
      );
      return {
        ok: true,
        code: 0,
        stdout: [
          versionState.upgraded
            ? `Upgraded Codex ${versionState.beforeVersion} -> ${versionState.version}`
            : null,
          probe.stdout.trim(),
          "app-server RPC OK",
        ]
          .filter(Boolean)
          .join("\n"),
        stderr: probe.stderr.trim(),
        codexVersion: versionState.version,
        appServerVersion: versionState.appServerVersion,
        supportedCodexVersion: versionState.supportedVersion,
        upgraded: versionState.upgraded,
        threads,
      };
    } finally {
      client.close();
    }
  }

  async ensureCodexVersion(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    const existing = this.versionChecks.get(host.id);
    if (existing) {
      return existing;
    }

    const check = this.checkAndUpgradeCodex(host).finally(() => {
      this.versionChecks.delete(host.id);
    });
    this.versionChecks.set(host.id, check);
    return check;
  }

  async checkAndUpgradeCodex(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    try {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "checkingVersion",
        message: `正在检查 ${hostDisplayName(host)} 的远端 Codex 版本`,
      });
      const supportedVersion = SUPPORTED_CODEX_VERSION;
      const beforeVersion = await this.readCodexVersion(host);
      const runtimeState = await this.readAppServerRuntimeState(host);
      const appServerVersion = runtimeState.running
        ? await this.readRunningAppServerVersion(host)
        : null;
      const currentRuntimeVersion = appServerVersion ?? beforeVersion;
      const cliVersionSupported = isCodexVersionAtLeast(beforeVersion, supportedVersion);
      const runtimeVersionSupported = isCodexVersionAtLeast(
        currentRuntimeVersion,
        supportedVersion,
      );

      if (cliVersionSupported && runtimeVersionSupported) {
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "connecting",
          message: `${hostDisplayName(host)} 的远端 Codex 已是最新版本 ${beforeVersion}`,
        });
        return {
          version: beforeVersion,
          appServerVersion,
          supportedVersion,
          beforeVersion,
          upgraded: false,
        };
      }

      if (runtimeState.running) {
        if (await this.hasActiveLoadedThread(host)) {
          throw new Error(
            `Remote Codex runtime ${currentRuntimeVersion} is below supported ${supportedVersion}, but a loaded thread is active`,
          );
        }
        await this.terminateUnmanagedAppServer(host);
      }

      if (!cliVersionSupported) {
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "upgrading",
          message: `正在升级 ${hostDisplayName(host)} 的远端 Codex ${beforeVersion} -> ${supportedVersion}`,
        });
        const version = await this.upgradeCodex(host, supportedVersion);
        await this.ensureAppServerStoppedAfterUpgrade(host);
        if (!isCodexVersionAtLeast(version, supportedVersion)) {
          throw new Error(
            `Remote Codex upgraded to ${version}, still below supported ${supportedVersion}`,
          );
        }
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "restarting",
          message: `${hostDisplayName(host)} 的远端 Codex 已升级到 ${version}，正在重启 app-server`,
        });
        return {
          version,
          appServerVersion: null,
          supportedVersion,
          beforeVersion,
          upgraded: true,
        };
      }

      hostLifecycleBus.emit({
        hostId: host.id,
        status: "restarting",
        message: `${hostDisplayName(host)} 的远端 Codex CLI 已是 ${beforeVersion}，正在重启旧 app-server ${currentRuntimeVersion}`,
      });
      return {
        version: beforeVersion,
        appServerVersion: null,
        supportedVersion,
        beforeVersion,
        upgraded: false,
      };
    } catch (error) {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "failed",
        message: messageFromError(error),
      });
      throw error;
    }
  }

  clearVersionCheck(hostId: number) {
    this.versionChecks.delete(hostId);
  }

  private async readCodexVersion(host: HostWithSecret) {
    const result = await this.ssh.exec(host, remoteLoginShellCommand(codexRemoteVersionPayload()));
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to read remote Codex version");
    }
    const parsed = parseCodexVersion(result.stdout);
    if (!parsed) {
      throw new Error(`Unable to parse remote Codex version: ${result.stdout.trim()}`);
    }
    return parsed.version;
  }

  private async upgradeCodex(host: HostWithSecret, version: string) {
    const result = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteUpgradeAndRestartPayload(version)),
    );
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to upgrade remote Codex");
    }
    const parsed = parseCodexVersion(result.stdout);
    if (!parsed) {
      throw new Error(`Unable to parse upgraded remote Codex version: ${result.stdout.trim()}`);
    }
    return parsed.version;
  }

  private async ensureAppServerStoppedAfterUpgrade(host: HostWithSecret) {
    const runtimeState = await this.readAppServerRuntimeState(host);
    if (runtimeState.running) {
      await this.terminateUnmanagedAppServer(host);
    } else {
      this.ssh.disconnectHost(host);
    }
  }

  private async terminateUnmanagedAppServer(host: HostWithSecret) {
    hostLifecycleBus.emit({
      hostId: host.id,
      status: "restarting",
      message: `正在停止 ${hostDisplayName(host)} 的旧远端 Codex app-server`,
    });
    const result = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteTerminateUnmanagedAppServerPayload()),
    );
    if (result.code !== 0) {
      throw new Error(
        result.stderr || result.stdout || "Failed to terminate unmanaged remote Codex app-server",
      );
    }
    this.ssh.disconnectHost(host);
  }

  private async readAppServerRuntimeState(host: HostWithSecret) {
    const result = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteAppServerRuntimeStatePayload()),
    );
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.code === 0) {
      const parsed = parseAppServerRuntimeStateOutput(result.stdout);
      const running = parsed?.status === "running";
      const appServerVersion = running ? await this.readRunningAppServerVersion(host) : null;
      return {
        running,
        appServerVersion,
        raw: combined.trim(),
      };
    }
    return {
      running: false,
      appServerVersion: null,
      raw: combined.trim(),
    };
  }

  private async readRunningAppServerVersion(host: HostWithSecret) {
    const { CodexRpcClient } = await import("./rpc");
    const client = new CodexRpcClient(host, {
      skipVersionCheck: true,
      requireExistingAppServer: true,
    });
    try {
      const userAgent = await client.probeRuntimeVersion();
      if (!userAgent) {
        return null;
      }
      const parsed = parseCodexVersion(userAgent);
      if (!parsed) {
        throw new Error(`Unable to parse remote app-server version: ${userAgent}`);
      }
      return parsed.version;
    } finally {
      client.close();
    }
  }

  private async hasActiveLoadedThread(host: HostWithSecret) {
    const { CodexRpcClient } = await import("./rpc");
    const client = new CodexRpcClient(host, {
      skipVersionCheck: true,
      requireExistingAppServer: true,
    });
    try {
      await client.connect();
      const loaded = await client.request<{ data?: string[]; nextCursor?: string | null }>(
        "thread/loaded/list",
        {},
        30_000,
      );
      for (const threadId of loaded.data ?? []) {
        const read = await client.request<any>(
          "thread/read",
          { threadId, includeTurns: false },
          30_000,
        );
        if (isActiveThreadStatus(read?.thread?.status ?? read?.status)) {
          return true;
        }
      }
      return false;
    } finally {
      client.close();
    }
  }
}

function isActiveThreadStatus(status: any) {
  return status === "active" || status?.type === "active";
}

function parseAppServerRuntimeStateOutput(
  output: string,
): { status?: string; backend?: string; appServerVersion?: string } | null {
  try {
    const parsed = JSON.parse(output.trim());
    return {
      status: typeof parsed.status === "string" ? parsed.status : undefined,
      backend: typeof parsed.backend === "string" ? parsed.backend : undefined,
      appServerVersion:
        typeof parsed.appServerVersion === "string" ? parsed.appServerVersion : undefined,
    };
  } catch {
    return null;
  }
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
