import type { HostWithSecret, RemoteCodexVersionState } from "./ssh-types";
import { isCodexVersionAtLeast, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { hostLifecycleBus } from "../state/host-events";
import type { SshConnectionPool } from "./ssh-connection";
import { AppServerRuntimeProbe } from "./app-server-runtime-probe";
import { CodexUpgrader } from "./codex-upgrader";
import { CodexVersionChecker } from "./codex-version-checker";
import { HostVerifyService } from "./host-verify-service";

export class CodexRuntimeService {
  private readonly versionChecks = new Map<number, Promise<RemoteCodexVersionState>>();
  private readonly appServerRuntime: AppServerRuntimeProbe;
  private readonly upgrader: CodexUpgrader;
  private readonly versionChecker: CodexVersionChecker;
  private readonly verifier: HostVerifyService;

  constructor(ssh: SshConnectionPool) {
    this.appServerRuntime = new AppServerRuntimeProbe(ssh);
    this.upgrader = new CodexUpgrader(ssh);
    this.versionChecker = new CodexVersionChecker(ssh);
    this.verifier = new HostVerifyService(ssh, (host) => this.ensureCodexVersion(host));
  }

  async verify(host: HostWithSecret) {
    return await this.verifier.verify(host);
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
      const beforeVersion = await this.versionChecker.readVersionOrRecoverableMissing(host);
      const runtimeState = await this.appServerRuntime.readState(host);
      const appServerVersion = runtimeState.appServerVersion;
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
        if (await this.appServerRuntime.hasActiveLoadedThread(host)) {
          throw new Error(
            `Remote Codex runtime ${currentRuntimeVersion} is below supported ${supportedVersion}, but a loaded thread is active`,
          );
        }
        await this.appServerRuntime.terminateUnmanaged(host);
      }

      if (!cliVersionSupported) {
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "upgrading",
          message: `正在升级 ${hostDisplayName(host)} 的远端 Codex ${beforeVersion} -> ${supportedVersion}`,
        });
        const version = await this.upgrader.upgrade(host, supportedVersion);
        await this.appServerRuntime.ensureStoppedAfterUpgrade(host);
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
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
