import type { HostWithSecret, RemoteCodexVersionState } from "./ssh-types";
import {
  isAppServerProxyStartupFailure,
  isRecoverableCodexInstallError,
} from "./codex-install-errors";
import { isCodexVersionAtLeast, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { hostLifecycleBus } from "../state/host-events";
import { currentGatewayUserId } from "../state/memory";
import type { SshConnectionPool } from "./ssh-connection";
import { AppServerRuntimeProbe } from "./app-server-runtime-probe";
import { CodexUpgrader } from "./codex-upgrader";
import { CodexVersionChecker } from "./codex-version-checker";
import { HostVerifyService } from "./host-verify-service";

export class CodexRuntimeService {
  private readonly versionChecks = new Map<string, Promise<RemoteCodexVersionState>>();
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
    const key = this.hostKey(host.id);
    const existing = this.versionChecks.get(key);
    if (existing) {
      return existing;
    }

    const check = this.checkAndUpgradeCodex(host).finally(() => {
      this.versionChecks.delete(key);
    });
    this.versionChecks.set(key, check);
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

      if (runtimeState.running && runtimeState.versionError) {
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "restarting",
          message: `${hostDisplayName(host)} 的远端 Codex app-server 无法握手，正在重启：${runtimeState.versionError}`,
        });
        await this.appServerRuntime.terminateUnmanaged(host);
        return {
          version: beforeVersion,
          appServerVersion: null,
          supportedVersion,
          beforeVersion,
          upgraded: false,
        };
      }

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
    this.versionChecks.delete(this.hostKey(hostId));
  }

  async repairAfterProxyFailure(
    host: HostWithSecret,
    error: unknown,
  ): Promise<RemoteCodexVersionState> {
    if (!isRecoverableCodexInstallError(error) && !isAppServerProxyStartupFailure(error)) {
      throw error;
    }

    hostLifecycleBus.emit({
      hostId: host.id,
      status: "upgrading",
      message: `${hostDisplayName(host)} 的远端 Codex app-server 启动失败，正在重新安装 ${SUPPORTED_CODEX_VERSION}：${messageFromError(error)}`,
    });

    const beforeVersion = await this.readVersionForRepair(host);
    await this.stopRuntimeIfPresent(host);
    const version = await this.upgrader.upgrade(host, SUPPORTED_CODEX_VERSION);
    await this.appServerRuntime.ensureStoppedAfterUpgrade(host);

    return {
      version,
      appServerVersion: null,
      supportedVersion: SUPPORTED_CODEX_VERSION,
      beforeVersion,
      upgraded: true,
    };
  }

  private hostKey(hostId: number) {
    return `${currentGatewayUserId() ?? "anonymous"}:${hostId}`;
  }

  private async readVersionForRepair(host: HostWithSecret) {
    try {
      return await this.versionChecker.readVersionOrRecoverableMissing(host);
    } catch {
      return "0.0.0";
    }
  }

  private async stopRuntimeIfPresent(host: HostWithSecret) {
    const runtimeState = await this.appServerRuntime.readState(host);
    if (runtimeState.running) {
      await this.appServerRuntime.terminateUnmanaged(host);
    }
  }
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
